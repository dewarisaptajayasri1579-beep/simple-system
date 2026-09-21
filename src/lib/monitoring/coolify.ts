import { Client } from "pg"

import { ensureBucketExists } from "@/lib/backup/r2"
import { decryptSecret } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

export type CoolifyApplication = {
  uuid: string
  name: string
  git_repository: string | null
  git_branch: string | null
  fqdn: string | null
  server_uuid: string
  environment_id: number
  source_id: number | null
  source_type: string | null
}

/// Response GET /github-apps Coolify — "Source" GitHub (GitHub App terinstall, atau "Public GitHub"
/// default) yang bisa dipakai aplikasi buat deploy dari repo. `id` numerik cuma unik di dalam SATU
/// instance Coolify (jadi tidak boleh dipakai sebagai key lintas-VPS), `uuid` yang stabil dipakai
/// buat upsert ke tabel GithubSource kita.
export type CoolifyGithubApp = {
  id: number
  uuid: string
  name: string
  is_public: boolean
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
  /// Format "running:healthy" / "exited:unhealthy" dst (gabungan Docker container state + health
  /// check) — dari GET /databases, sudah ikut di response list-nya, tidak perlu call terpisah.
  status: string
  last_online_at: string | null
  environment_id: number
}

type CoolifyProject = { id: number; uuid: string; name: string }
type CoolifyProjectDetail = { environments: { id: number; uuid: string }[] }

export type CoolifyProjectEnvInfo = { projectName: string; projectUuid: string; environmentUuid: string }

/** Coolify punya hierarki Project > Environment > Resource, tapi list /applications & /databases
 *  cuma kasih `environment_id` (angka) — nama & UUID project/environment baru muncul lewat GET
 *  /projects/{uuid} (nested `environments[]`). Panggilannya sebanyak jumlah PROJECT (bukan jumlah
 *  aplikasi/database), jadi tetap murah walau resource-nya banyak. UUID project+environment
 *  dipakai bareng UUID resource-nya sendiri buat bangun link langsung ke dashboard Coolify (lihat
 *  coolifyResourceLink()). Best-effort: gagal (mis. token belum punya scope) balikin Map kosong,
 *  project name/link di aplikasi/database itu simply null. */
async function fetchProjectEnvInfoByEnvironmentId(apiBase: string, apiToken: string): Promise<Map<number, CoolifyProjectEnvInfo>> {
  const result = new Map<number, CoolifyProjectEnvInfo>()
  try {
    const projects = (await coolifyGet(apiBase, apiToken, "/projects")) as CoolifyProject[]
    if (!Array.isArray(projects)) return result

    await Promise.all(
      projects.map(async (p) => {
        try {
          const detail = (await coolifyGet(apiBase, apiToken, `/projects/${p.uuid}`)) as CoolifyProjectDetail
          for (const env of detail.environments ?? []) {
            result.set(env.id, { projectName: p.name, projectUuid: p.uuid, environmentUuid: env.uuid })
          }
        } catch (e) {
          console.error(`[coolify] gagal ambil detail project "${p.name}":`, e)
        }
      })
    )
  } catch (e) {
    console.error("[coolify] gagal ambil daftar project:", e)
  }
  return result
}

/** Base URL dashboard web Coolify (BUKAN base API) — `coolifyApiUrl` yang disimpan user bisa
 *  berupa domain root atau sudah termasuk "/api/v1" (lihat normalizeCoolifyApiUrl), jadi lepas
 *  suffix itu kalau ada supaya dapat base yang benar buat link ke halaman web-nya. */
function coolifyWebBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "").replace(/\/api\/v\d+$/, "")
}

/** Link langsung ke halaman resource ini di dashboard Coolify (bukan API) — null kalau salah satu
 *  komponennya belum ke-resolve (mis. token belum sempat sync project/environment). */
export function coolifyResourceLink(
  apiUrl: string | null,
  kind: "application" | "database",
  projectUuid: string | null,
  environmentUuid: string | null,
  resourceUuid: string | null
): string | null {
  if (!apiUrl || !projectUuid || !environmentUuid || !resourceUuid) return null
  return `${coolifyWebBaseUrl(apiUrl)}/project/${projectUuid}/environment/${environmentUuid}/${kind}/${resourceUuid}`
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

async function coolifyPatch(apiBase: string, apiToken: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "PATCH",
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

/// Best-effort — instance Coolify lama atau token tanpa permission tertentu bisa gagal, tidak boleh
/// menggagalkan sync aplikasi secara keseluruhan.
async function fetchCoolifyGithubApps(apiBase: string, apiToken: string): Promise<CoolifyGithubApp[]> {
  try {
    const data = await coolifyGet(apiBase, apiToken, "/github-apps")
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/// Sinkronkan daftar Git App/Source GitHub milik satu VPS ke tabel GithubSource, lalu balikin map
/// numeric id Coolify (`source_id` di response /applications) -> id lokal GithubSource — dipakai
/// syncCoolifyApplications() buat link Application.githubSourceId. Numeric id CUMA valid di dalam
/// panggilan sync ini (tidak disimpan sebagai key), makanya di-resolve ulang tiap sync lewat uuid.
async function syncGithubSources(vpsId: string, apiBase: string, apiToken: string): Promise<Map<number, string>> {
  const sources = await fetchCoolifyGithubApps(apiBase, apiToken)
  const idToLocalId = new Map<number, string>()
  for (const source of sources) {
    if (!source.uuid) continue
    const saved = await prisma.githubSource
      .upsert({
        where: { vpsServerId_coolifyUuid: { vpsServerId: vpsId, coolifyUuid: source.uuid } },
        create: { vpsServerId: vpsId, coolifyUuid: source.uuid, name: source.name, isPublic: Boolean(source.is_public) },
        update: { name: source.name, isPublic: Boolean(source.is_public) },
      })
      .catch(() => null)
    if (saved) idToLocalId.set(source.id, saved.id)
  }
  return idToLocalId
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

/** Beberapa aplikasi (mis. Laravel) split kredensial database jadi env var terpisah (DB_HOST,
 *  DB_PORT, DB_USERNAME, dst) alih-alih 1 connection string gabungan — kalau
 *  findDatabaseUrlValue() di atas tidak ketemu apa-apa (tidak ada satu pun env var yang cocok
 *  pola DATABASE_URL/DB_URL/dst), coba cari HOST-nya langsung dari salah satu variasi nama umum
 *  ini. Coolify pakai UUID resource database sebagai hostname internalnya di Docker network
 *  (lihat matchDatabaseByHost di bawah) — nilai host mentah ini sudah cukup buat matching, tidak
 *  perlu construct connection string penuh. Ketahuan lewat kasus nyata 2026-09-21: aplikasi
 *  "tb-thosin" (Laravel, database MariaDB) pakai DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD
 *  terpisah, jadi databaseInfo-nya tidak pernah ke-isi walau database-nya beneran ada & aktif. */
function findDatabaseHostValue(envs: CoolifyEnvVar[]): string | null {
  const pattern = /^(DB|DATABASE|MYSQL|MARIADB|POSTGRES|PG)_HOST$/i
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

  // Panggilan API PERTAMA ke Coolify — kalau token-nya rusak/dicabut, ini yang gagal duluan
  // (401). Dicatat ke VpsServer.coolifySyncError supaya ketahuan LANGSUNG lewat badge kesehatan,
  // bukan cuma diam-diam gagal di log cron (lihat komentar field di schema.prisma).
  let apps: CoolifyApplication[]
  try {
    apps = await fetchCoolifyApplications(vps.coolifyApiUrl, token)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync Coolify gagal"
    await prisma.vpsServer
      .update({ where: { id: vps.id }, data: { coolifySyncError: message, coolifySyncCheckedAt: new Date() } })
      .catch(() => {})
    throw e
  }
  await prisma.vpsServer
    .update({ where: { id: vps.id }, data: { coolifySyncError: null, coolifySyncCheckedAt: new Date() } })
    .catch(() => {})

  // Sekali panggil buat semua project di Coolify VPS ini (bukan per aplikasi/database) — lihat
  // fetchProjectEnvInfoByEnvironmentId(). Dipakai buat badge + search "Project" + link langsung
  // ke dashboard Coolify di monitoring.
  const projectByEnvId = await fetchProjectEnvInfoByEnvironmentId(apiBase, token)
  const githubSourceIdByCoolifyId = await syncGithubSources(vps.id, apiBase, token)

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
          coolifyDatabasesCache: databases.map((db) => ({
            uuid: db.uuid,
            name: db.name,
            databaseType: db.database_type,
            status: db.status,
            // Coolify balikin "2026-08-20 14:21:43" (UTC, tanpa suffix "Z") — normalisasi ke ISO
            // string yang valid dulu supaya `new Date(...)` di formatter UI (formatDateTimeId)
            // tidak parsing-dependent-browser.
            lastOnlineAt: db.last_online_at ? new Date(`${db.last_online_at.replace(" ", "T")}Z`).toISOString() : null,
            projectName: projectByEnvId.get(db.environment_id)?.projectName ?? null,
            projectUuid: projectByEnvId.get(db.environment_id)?.projectUuid ?? null,
            environmentUuid: projectByEnvId.get(db.environment_id)?.environmentUuid ?? null,
          })),
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
        const host = dbUrl ? extractHost(dbUrl) : findDatabaseHostValue(envs)
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

    const projectEnvInfo = projectByEnvId.get(app.environment_id) ?? null
    const githubSourceId = app.source_id !== null ? (githubSourceIdByCoolifyId.get(app.source_id) ?? null) : null

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
        coolifyProjectName: projectEnvInfo?.projectName ?? null,
        coolifyProjectUuid: projectEnvInfo?.projectUuid ?? null,
        coolifyEnvironmentUuid: projectEnvInfo?.environmentUuid ?? null,
        githubSourceId,
      },
      update: {
        name: app.name || app.uuid,
        domain,
        gitRepository: app.git_repository || null,
        gitBranch: app.git_branch || null,
        coolifyProjectName: projectEnvInfo?.projectName ?? null,
        coolifyProjectUuid: projectEnvInfo?.projectUuid ?? null,
        coolifyEnvironmentUuid: projectEnvInfo?.environmentUuid ?? null,
        githubSourceId,
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

/** Nama bucket R2 buat 1 VPS — override per-VPS (VpsServer.r2BucketName, mis. dipisah biar tidak
 *  campur sama VPS lain) kalau diisi, fallback ke bucket global default (dipakai backup app ini
 *  sendiri + VPS yang belum di-pisah bucket-nya). */
export function r2BucketForVps(vps: { r2BucketName: string | null }): string {
  return vps.r2BucketName ?? requiredEnv("R2_BACKUP_BUCKET")
}

/** Pastikan ada 1 S3 Storage di Coolify yang nunjuk ke bucket R2 VPS ini (lihat r2BucketForVps) —
 *  bucket-nya dibuat dulu di R2 kalau belum ada (lihat ensureBucketExists di lib/backup/r2.ts).
 *  S3 Storage-nya dibuat sekali, uuid-nya disimpan di VpsServer.coolifyS3StorageUuid supaya tidak
 *  bikin S3 Storage baru berulang kali tiap cron jalan. */
async function ensureS3Storage(
  apiBase: string,
  token: string,
  vps: { id: string; coolifyS3StorageUuid: string | null; r2BucketName: string | null }
): Promise<string> {
  if (vps.coolifyS3StorageUuid) return vps.coolifyS3StorageUuid

  const bucket = r2BucketForVps(vps)
  await ensureBucketExists(bucket)

  const created = (await coolifyPost(apiBase, token, "/s3-storages", {
    name: vps.r2BucketName ? `Cloudflare R2 (auto - ${vps.r2BucketName})` : "Cloudflare R2 (auto)",
    // Coolify validasi field description-nya ketat (tolak em dash "-" unicode dan karakter non-ASCII
    // lain dengan pesan generik "format is invalid") -- sengaja ASCII polos di sini.
    description: "Auto-created by simple-system monitoring.",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    bucket,
    region: "auto",
    key: requiredEnv("R2_ACCESS_ID"),
    secret: requiredEnv("R2_SECRET_KEY"),
    is_usable: true,
  })) as { uuid: string }

  await prisma.vpsServer.update({ where: { id: vps.id }, data: { coolifyS3StorageUuid: created.uuid } }).catch(() => {})
  return created.uuid
}

/** Coolify simpan jenis database jadwal backup sebagai nama class internal PHP-nya (mis.
 *  "App\Models\StandalonePostgresql" buat database_type "standalone-postgresql") — dipakai
 *  ensureDatabaseBackups() buat mastiin jadwal yang ketemu BENERAN punya database ini, bukan
 *  jadwal database lain yang kebetulan nyasar ke-serialisasi di sini (lihat komentar
 *  ensureDatabaseBackups di bawah). */
function coolifyBackupModelClassForType(databaseType: string): string {
  const pascalCase = databaseType.replace(/(^|-)([a-z])/g, (_match, _sep, c: string) => c.toUpperCase())
  return `App\\Models\\${pascalCase}`
}

/** Auto-setup backup-ke-R2 buat database Coolify yang BELUM punya jadwal backup MILIKNYA SENDIRI —
 *  supaya database baru yang dibuat belakangan otomatis ke-backup tanpa perlu setup manual lagi.
 *  Kalau database itu SUDAH punya minimal 1 jadwal backup dengan database_type YANG COCOK
 *  (termasuk yang dibuat manual sebelumnya, save_s3 atau bukan), TIDAK disentuh — dianggap sudah
 *  dikelola manual, supaya tidak dobel/menimpa konfigurasi yang sengaja di-custom user.
 *
 *  Cek TIPE-nya (bukan cuma "ada jadwal apa pun") SENGAJA ditambahkan setelah nemu bug nyata
 *  2026-09-21: GET /databases/{uuid}/backups Coolify kadang balikin jadwal database LAIN yang
 *  ke-serialisasi salah di response (mis. database Postgres baru dikira "sudah ada jadwal" cuma
 *  karena ke-tempel jadwal MariaDB database lain) — pengecekan lama (`existing.length > 0`) ketipu
 *  dan SKIP database yang sebenarnya belum pernah dibackup sama sekali (lihat percakapan
 *  monitoring — os-template baru ketahuan belum ke-backup pas user coba "Backup Sekarang" manual).
 *
 *  Butuh token dengan ability `write`, beda dari token `read`-only yang cukup buat
 *  syncCoolifyApplications di atas. Migrasi paksa SEMUA database (termasuk yang sudah ada
 *  jadwalnya) ke bucket VPS tertentu pakai migrateAllDatabaseBackupsToVpsBucket() di bawah, bukan
 *  fungsi ini. */
export async function ensureDatabaseBackups(
  vps: SyncCoolifyVps & { id: string; coolifyS3StorageUuid: string | null; r2BucketName: string | null }
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
      const existing = (await coolifyGet(apiBase, token, `/databases/${db.uuid}/backups`)) as { database_type?: string }[]
      const expectedType = coolifyBackupModelClassForType(db.database_type)
      const hasOwnSchedule = Array.isArray(existing) && existing.some((c) => c.database_type === expectedType)
      if (hasOwnSchedule) continue

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

/** Migrasi SEKALI JALAN (bukan dipanggil cron rutin) — paksa SEMUA database di VPS ini (termasuk
 *  yang SUDAH punya jadwal backup dari sebelumnya, entah manual atau dari S3 Storage lain) supaya
 *  jadwalnya nunjuk ke S3 Storage/bucket VPS ini (lihat r2BucketForVps). Beda dari
 *  ensureDatabaseBackups() yang sengaja SKIP database yang sudah ada jadwalnya — ini kebalikannya,
 *  dipakai waktu owner sengaja mau konsolidasi "1 VPS = 1 bucket" tanpa kecuali (lihat percakapan
 *  monitoring). Kalau database itu punya lebih dari 1 jadwal (jarang), semuanya di-PATCH. */
export async function migrateAllDatabaseBackupsToVpsBucket(
  vps: SyncCoolifyVps & { id: string; coolifyS3StorageUuid: string | null; r2BucketName: string | null }
): Promise<{ updated: number; created: number }> {
  if (!vps.coolifyApiUrl || !vps.coolifyApiToken) return { updated: 0, created: 0 }

  const apiBase = normalizeCoolifyApiUrl(vps.coolifyApiUrl)
  const token = decryptSecret(vps.coolifyApiToken)

  const databases = await fetchDatabases(apiBase, token)
  if (databases.length === 0) return { updated: 0, created: 0 }

  const s3StorageUuid = await ensureS3Storage(apiBase, token, vps)

  let updated = 0
  let created = 0
  for (const db of databases) {
    try {
      const existing = (await coolifyGet(apiBase, token, `/databases/${db.uuid}/backups`)) as { uuid: string; s3_storage_id?: number }[]
      if (!Array.isArray(existing) || existing.length === 0) {
        await coolifyPost(apiBase, token, `/databases/${db.uuid}/backups`, {
          frequency: "0 21 * * *",
          enabled: true,
          save_s3: true,
          s3_storage_uuid: s3StorageUuid,
        })
        created += 1
        continue
      }
      for (const schedule of existing) {
        await coolifyPatch(apiBase, token, `/databases/${db.uuid}/backups/${schedule.uuid}`, {
          save_s3: true,
          s3_storage_uuid: s3StorageUuid,
        })
        updated += 1
      }
    } catch (e) {
      console.error(`[coolify] migrasi backup gagal untuk database "${db.name}" (${db.uuid}):`, e)
    }
  }

  return { updated, created }
}

/** Trigger 1 backup EKSEKUSI SEKARANG dari jadwal backup yang SUDAH ADA — beda dari
 *  ensureDatabaseBackups() di atas (yang cuma bikin JADWAL). Coolify REST API TIDAK punya
 *  endpoint "run backup" khusus; caranya PATCH jadwal backup yang sudah ada dengan `backup_now:
 *  true` (lihat https://next.coolify.io/docs/api/endpoints/databases/update-database-backup) —
 *  ini men-trigger 1 eksekusi tambahan tanpa mengubah jadwal reguler-nya. Butuh jadwal backup
 *  sudah ada duluan (dari ensureDatabaseBackups atau dibuat manual di Coolify); kalau belum ada
 *  sama sekali, balikin error yang jelas. */
export async function triggerDatabaseBackupNow(vps: SyncCoolifyVps, databaseUuid: string): Promise<{ ok: boolean; error?: string }> {
  if (!vps.coolifyApiUrl || !vps.coolifyApiToken) return { ok: false, error: "VPS ini belum diisi Coolify API URL/token" }

  const apiBase = normalizeCoolifyApiUrl(vps.coolifyApiUrl)
  const token = decryptSecret(vps.coolifyApiToken)

  try {
    const schedules = (await coolifyGet(apiBase, token, `/databases/${databaseUuid}/backups`)) as { uuid: string }[]
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return { ok: false, error: "Database ini belum punya jadwal backup sama sekali — sync ulang dulu (auto-setup jadwal) atau buat manual di Coolify." }
    }

    await coolifyPatch(apiBase, token, `/databases/${databaseUuid}/backups/${schedules[0].uuid}`, { backup_now: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal trigger backup" }
  }
}
