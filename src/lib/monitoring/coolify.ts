import { Client } from "pg"

import { decryptSecret } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

export type CoolifyApplication = {
  uuid: string
  name: string
  git_repository: string | null
  git_branch: string | null
  fqdn: string | null
  server_uuid: string
}

export type CoolifyEnvVar = {
  key: string
  value?: string | null
  real_value?: string | null
}

export type CoolifyDatabase = {
  uuid: string
  name: string
  database_type: string
}

/** Terima URL Coolify apa adanya (mis. cuma domain root "https://coolify.contoh.com", dengan
 *  atau tanpa trailing slash) — user sering tidak tahu/ingat path API resminya harus diakhiri
 *  "/api/v1". Kalau path itu belum ada, tambahkan otomatis; kalau sudah ada, biarkan. */
function normalizeCoolifyApiUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "")
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

async function coolifyGet(apiBase: string, apiToken: string, path: string): Promise<unknown> {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Coolify API error ${res.status} (${apiBase}${path})`)
  return res.json()
}

async function coolifyPost(apiBase: string, apiToken: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Coolify API error ${res.status} (${apiBase}${path}): ${text}`)
  return text ? JSON.parse(text) : null
}

export async function fetchCoolifyApplications(apiUrl: string, apiToken: string): Promise<CoolifyApplication[]> {
  const data = await coolifyGet(normalizeCoolifyApiUrl(apiUrl), apiToken, "/applications")
  return Array.isArray(data) ? data : []
}

/** Butuh permission token `read:sensitive` (selain `read`) — tanpa itu, Coolify tidak
 *  mengirimkan field value/real_value sama sekali (bukan disensor, memang tidak ada di response),
 *  jadi fungsi ini balikin array kosong secara alami, tidak error. */
async function fetchApplicationEnvs(apiBase: string, apiToken: string, appUuid: string): Promise<CoolifyEnvVar[]> {
  const data = await coolifyGet(apiBase, apiToken, `/applications/${appUuid}/envs`)
  return Array.isArray(data) ? data : []
}

async function fetchDatabases(apiBase: string, apiToken: string): Promise<CoolifyDatabase[]> {
  const data = await coolifyGet(apiBase, apiToken, "/databases")
  return Array.isArray(data) ? data : []
}

/** Coolify balikin `fqdn` (BUKAN `domains` — nama field beda dari dokumentasi OpenAPI resminya)
 *  sebagai string comma-separated berisi URL penuh, entry pertama biasanya domain
 *  auto-generated "*.sslip.io" (bukan yang mau ditampilkan), diikuti domain asli kalau ada
 *  (mis. "http://xxx.1.2.3.4.sslip.io,https://app.contoh.com,https://www.app.contoh.com") —
 *  ambil yang PERTAMA BUKAN sslip.io kalau ada, biar yang ditampilkan domain sungguhan;
 *  fallback ke entry pertama apa pun kalau semuanya sslip.io (belum ada domain custom). */
export function firstCleanDomain(fqdn: string | null | undefined): string | null {
  if (!fqdn) return null
  const clean = (raw: string) => raw.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/:\d+$/, "")
  const entries = fqdn.split(",").map(clean).filter(Boolean)
  if (entries.length === 0) return null
  return entries.find((d) => !d.includes(".sslip.io")) ?? entries[0]
}

const DB_TYPE_LABELS: Record<string, string> = {
  "standalone-postgresql": "PostgreSQL",
  "standalone-mysql": "MySQL",
  "standalone-mariadb": "MariaDB",
  "standalone-mongodb": "MongoDB",
  "standalone-redis": "Redis",
  "standalone-keydb": "KeyDB",
  "standalone-dragonfly": "Dragonfly",
  "standalone-clickhouse": "ClickHouse",
}

export function prettifyDatabaseType(type: string): string {
  return DB_TYPE_LABELS[type] || type.replace(/^standalone-/, "").replace(/(^|-)([a-z])/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase())
}

/** Cari env var yang namanya nunjuk ke connection string database (DATABASE_URL, DB_URL,
 *  POSTGRES_URL, dst — cocok pola apa pun yang diakhiri/mengandung salah satu kata kunci ini),
 *  ambil value paling "asli" yang tersedia. Kalau token belum punya read:sensitive, semua env
 *  tidak punya value sama sekali, jadi otomatis balikin null (tidak error). */
function findDatabaseUrlValue(envs: CoolifyEnvVar[]): string | null {
  const pattern = /(DATABASE_URL|DB_URL|POSTGRES_URL|MYSQL_URL|MONGO(?:DB)?_URL|REDIS_URL)/i
  const candidate = envs.find((e) => pattern.test(e.key))
  const value = candidate?.real_value ?? candidate?.value
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Ambil hostname dari connection string apa pun yang valid sebagai URL (postgres://, mysql://,
 *  redis://, dst — parser bawaan JS tidak peduli scheme-nya asal formatnya URL standar). */
function extractHost(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname || null
  } catch {
    return null
  }
}

/** Coolify biasanya pakai UUID resource database sebagai alias hostname-nya di internal Docker
 *  network — jadi cocokkan dengan cek apakah UUID database itu muncul sebagai bagian dari
 *  hostname yang dipakai aplikasi buat connect. Best-effort: kalau tidak ketemu, return null,
 *  field databaseInfo aplikasi itu simply tidak ke-isi (bukan error). */
function matchDatabaseByHost(host: string, databases: CoolifyDatabase[]): CoolifyDatabase | null {
  return databases.find((db) => host.includes(db.uuid)) ?? null
}

type ActivityResult = { lastAccessedBy: string | null; lastAccessedAt: Date | null }

/** Jalankan query SQL manual (activityQuery, diisi user sendiri) ke database aplikasi — connection
 *  string cuma dipakai sesaat di sini (dari env Coolify yang sama dipakai buat databaseInfo),
 *  TIDAK disimpan. Konvensi: kolom pertama hasil query = identitas user, kolom kedua = timestamp.
 *  Guard sederhana: cuma izinkan query yang diawali "select" (case-insensitive) — bukan proteksi
 *  penuh, tapi cukup buat cegah salah paste query non-SELECT yang bisa mengubah data. */
async function runActivityQuery(dbUrl: string, query: string): Promise<ActivityResult | null> {
  if (!/^\s*select/i.test(query)) return null

  const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000, query_timeout: 5000 })
  try {
    await client.connect()
    const result = await client.query(query)
    const row = result.rows[0]
    if (!row) return { lastAccessedBy: null, lastAccessedAt: null }
    const values = Object.values(row)
    const identifier = values[0] != null ? String(values[0]) : null
    const rawDate = values[1]
    const at = rawDate ? new Date(rawDate as string | number | Date) : null
    return { lastAccessedBy: identifier, lastAccessedAt: at && !Number.isNaN(at.getTime()) ? at : null }
  } catch {
    return null
  } finally {
    await client.end().catch(() => {})
  }
}

export type SyncCoolifyVps = { id: string; coolifyApiUrl: string | null; coolifyApiToken: string | null }

/** Sync aplikasi dari Coolify API ke tabel Application milik satu VpsServer. Match by
 *  (vpsServerId, coolifyUuid) — upsert supaya sync berulang tidak bikin duplikat. Field yang
 *  datang dari Coolify (name, domain, gitRepository, gitBranch, databaseInfo) yang ditimpa —
 *  field manual (backupLocation, notes, lastBackupAt, domainExpiresAt, activityQuery) tidak
 *  pernah disentuh. `databaseInfo`/hasil activityQuery cuma ditimpa kalau berhasil ketemu match
 *  baru (gagal ketemu = biarkan nilai lama, bukan dihapus — supaya kegagalan sesaat, mis. token
 *  belum diupdate read:sensitive-nya, tidak menghapus data yang sudah pernah berhasil ke-sync). */
export async function syncCoolifyApplications(vps: SyncCoolifyVps): Promise<{ synced: number }> {
  if (!vps.coolifyApiUrl || !vps.coolifyApiToken) return { synced: 0 }

  const apiBase = normalizeCoolifyApiUrl(vps.coolifyApiUrl)
  const token = decryptSecret(vps.coolifyApiToken)

  const apps = await fetchCoolifyApplications(vps.coolifyApiUrl, token)

  let databases: CoolifyDatabase[] = []
  try {
    databases = await fetchDatabases(apiBase, token)
    // Cuma update kalau fetch-nya BENERAN berhasil — supaya kegagalan sesaat (instance Coolify
    // lama tanpa endpoint ini, network blip, dst) tidak menimpa angka/daftar lama jadi kosong.
    // Daftar mentahnya (coolifyDatabasesCache) dipakai buat nunjukkin database yang TIDAK
    // ke-match ke aplikasi manapun — lihat GET /api/monitoring/vps.
    await prisma.vpsServer
      .update({
        where: { id: vps.id },
        data: {
          coolifyDatabaseCount: databases.length,
          coolifyDatabasesCache: databases.map((db) => ({ uuid: db.uuid, name: db.name, databaseType: db.database_type })),
        },
      })
      .catch(() => {})
  } catch {
    // Best-effort — kalau gagal (mis. instance Coolify lama tanpa endpoint ini), lanjut tanpa info database.
  }

  const existing = await prisma.application.findMany({
    where: { vpsServerId: vps.id, coolifyUuid: { not: null } },
    select: { coolifyUuid: true, activityQuery: true },
  })
  const activityQueryByUuid = new Map(existing.map((a) => [a.coolifyUuid as string, a.activityQuery]))

  let synced = 0

  for (const app of apps) {
    if (!app.uuid) continue
    const domain = firstCleanDomain(app.fqdn)

    let databaseInfo: string | null = null
    let databaseUuid: string | null = null
    let activity: ActivityResult | null = null
    if (databases.length > 0) {
      try {
        const envs = await fetchApplicationEnvs(apiBase, token, app.uuid)
        const dbUrl = findDatabaseUrlValue(envs)
        const host = dbUrl ? extractHost(dbUrl) : null
        const matched = host ? matchDatabaseByHost(host, databases) : null
        if (matched) {
          databaseInfo = `${prettifyDatabaseType(matched.database_type)} — ${matched.name}`
          databaseUuid = matched.uuid
        }

        const activityQuery = activityQueryByUuid.get(app.uuid)
        if (dbUrl && activityQuery) activity = await runActivityQuery(dbUrl, activityQuery)
      } catch {
        // Best-effort — satu aplikasi gagal ambil env/query tidak boleh gagalkan aplikasi lain.
      }
    }

    await prisma.application.upsert({
      where: { vpsServerId_coolifyUuid: { vpsServerId: vps.id, coolifyUuid: app.uuid } },
      create: {
        vpsServerId: vps.id,
        coolifyUuid: app.uuid,
        name: app.name || app.uuid,
        domain,
        gitRepository: app.git_repository || null,
        gitBranch: app.git_branch || null,
        databaseInfo,
        databaseUuid,
      },
      update: {
        name: app.name || app.uuid,
        domain,
        gitRepository: app.git_repository || null,
        gitBranch: app.git_branch || null,
        ...(databaseInfo ? { databaseInfo, databaseUuid } : {}),
        ...(activity?.lastAccessedAt ? { lastAccessedAt: activity.lastAccessedAt, lastAccessedBy: activity.lastAccessedBy } : {}),
      },
    })
    synced += 1
  }

  return { synced }
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} belum di-set`)
  return value
}

/** Pastikan ada 1 S3 Storage di Coolify yang nunjuk ke bucket R2 yang sama dipakai backup app ini
 *  sendiri (lihat lib/backup/r2.ts) — dibuat sekali, uuid-nya disimpan di
 *  VpsServer.coolifyS3StorageUuid supaya tidak bikin S3 Storage baru berulang kali tiap cron jalan. */
async function ensureS3Storage(
  apiBase: string,
  token: string,
  vps: { id: string; coolifyS3StorageUuid: string | null }
): Promise<string> {
  if (vps.coolifyS3StorageUuid) return vps.coolifyS3StorageUuid

  const created = (await coolifyPost(apiBase, token, "/s3-storages", {
    name: "Cloudflare R2 (auto)",
    description: "Dibuat otomatis oleh ensureDatabaseBackups() — bucket sama dengan backup database app ini sendiri.",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    bucket: requiredEnv("R2_BACKUP_BUCKET"),
    region: "auto",
    key: requiredEnv("R2_ACCESS_ID"),
    secret: requiredEnv("R2_SECRET_KEY"),
    is_usable: true,
  })) as { uuid: string }

  await prisma.vpsServer.update({ where: { id: vps.id }, data: { coolifyS3StorageUuid: created.uuid } }).catch(() => {})
  return created.uuid
}

/** Auto-setup backup-ke-R2 buat database Coolify yang BELUM punya jadwal backup sama sekali —
 *  supaya database baru yang dibuat belakangan otomatis ke-backup tanpa perlu setup manual lagi.
 *  Kalau database itu SUDAH punya minimal 1 jadwal backup (termasuk yang dibuat manual sebelumnya,
 *  save_s3 atau bukan), TIDAK disentuh — dianggap sudah dikelola manual, supaya tidak dobel/menimpa
 *  konfigurasi yang sengaja di-custom user. Butuh token dengan ability `write`, beda dari token
 *  `read`-only yang cukup buat syncCoolifyApplications di atas. */
export async function ensureDatabaseBackups(
  vps: SyncCoolifyVps & { id: string; coolifyS3StorageUuid: string | null }
): Promise<{ created: number }> {
  if (!vps.coolifyApiUrl || !vps.coolifyApiToken) return { created: 0 }

  const apiBase = normalizeCoolifyApiUrl(vps.coolifyApiUrl)
  const token = decryptSecret(vps.coolifyApiToken)

  const databases = await fetchDatabases(apiBase, token)
  if (databases.length === 0) return { created: 0 }

  const s3StorageUuid = await ensureS3Storage(apiBase, token, vps)

  let created = 0
  for (const db of databases) {
    try {
      const existing = await coolifyGet(apiBase, token, `/databases/${db.uuid}/backups`)
      if (Array.isArray(existing) && existing.length > 0) continue

      await coolifyPost(apiBase, token, `/databases/${db.uuid}/backups`, {
        frequency: "0 21 * * *",
        enabled: true,
        save_s3: true,
        s3_storage_uuid: s3StorageUuid,
      })
      created += 1
    } catch (e) {
      console.error(`[coolify] auto-setup backup gagal untuk database "${db.name}" (${db.uuid}):`, e)
    }
  }

  return { created }
}
