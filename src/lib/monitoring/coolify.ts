import { decryptSecret } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

export type CoolifyApplication = {
  uuid: string
  name: string
  git_repository: string | null
  git_branch: string | null
  domains: string | null
  server_uuid: string
}

/** Terima URL Coolify apa adanya (mis. cuma domain root "https://coolify.contoh.com", dengan
 *  atau tanpa trailing slash) — user sering tidak tahu/ingat path API resminya harus diakhiri
 *  "/api/v1". Kalau path itu belum ada, tambahkan otomatis; kalau sudah ada, biarkan. */
function normalizeCoolifyApiUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "")
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

export async function fetchCoolifyApplications(apiUrl: string, apiToken: string): Promise<CoolifyApplication[]> {
  const base = normalizeCoolifyApiUrl(apiUrl)
  const res = await fetch(`${base}/applications`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Coolify API error ${res.status} (${base}/applications)`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/** Coolify balikin `domains` sebagai string comma-separated berisi URL penuh (mis.
 *  "https://app.contoh.com:3000,https://alias.contoh.com") — ambil yang pertama, bersihkan
 *  scheme/port/trailing slash biar konsisten dengan cara domain ditampilkan di UI. */
export function firstCleanDomain(domains: string | null | undefined): string | null {
  if (!domains) return null
  const first = domains.split(",")[0]?.trim()
  if (!first) return null
  return first.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/:\d+$/, "") || null
}

export type SyncCoolifyVps = { id: string; coolifyApiUrl: string | null; coolifyApiToken: string | null }

/** Sync aplikasi dari Coolify API ke tabel Application milik satu VpsServer. Match by
 *  (vpsServerId, coolifyUuid) — upsert supaya sync berulang tidak bikin duplikat. HANYA field
 *  yang datang dari Coolify (name, domain, gitRepository, gitBranch) yang ditimpa — field manual
 *  (backupLocation, notes, lastBackupAt, domainExpiresAt) tidak pernah disentuh di sini. */
export async function syncCoolifyApplications(vps: SyncCoolifyVps): Promise<{ synced: number }> {
  if (!vps.coolifyApiUrl || !vps.coolifyApiToken) return { synced: 0 }

  const apps = await fetchCoolifyApplications(vps.coolifyApiUrl, decryptSecret(vps.coolifyApiToken))
  let synced = 0

  for (const app of apps) {
    if (!app.uuid) continue
    const domain = firstCleanDomain(app.domains)
    await prisma.application.upsert({
      where: { vpsServerId_coolifyUuid: { vpsServerId: vps.id, coolifyUuid: app.uuid } },
      create: {
        vpsServerId: vps.id,
        coolifyUuid: app.uuid,
        name: app.name || app.uuid,
        domain,
        gitRepository: app.git_repository || null,
        gitBranch: app.git_branch || null,
      },
      update: {
        name: app.name || app.uuid,
        domain,
        gitRepository: app.git_repository || null,
        gitBranch: app.git_branch || null,
      },
    })
    synced += 1
  }

  return { synced }
}
