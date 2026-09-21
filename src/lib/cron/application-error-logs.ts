import { sshExec, sudoWrap, vpsSshCreds, type VpsSshLike } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

const FALLBACK_LOOKBACK_MS = 130 * 60 * 1000
const MAX_LOOKBACK_MS = 26 * 60 * 60 * 1000
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const ERROR_PATTERN = /error|exception|fatal|panic|traceback/i
/** "Error response from daemon: No such container: ..." itu keluhan DOCKER CLI kita sendiri (nama
 *  container di cache sudah basi, biasanya karena app-nya baru di-redeploy dan dapat nama
 *  container baru) — BUKAN error dari aplikasinya. Kalau tidak difilter, ini kesimpen sebagai
 *  "error aplikasi" yang menyesatkan (ketahuan lewat testing manual 2026-09-21). Container yang
 *  dapat baris ini akan otomatis benar lagi begitu cache Docker disk VPS-nya di-refresh
 *  (cron harian 03:00 atau tombol "Cek Sekarang"), tidak perlu penanganan khusus di sini. */
const DOCKER_CLI_ERROR_PATTERN = /^Error response from daemon:/i

/** Banyak framework (Nest.js dkk) nge-color log-nya buat terminal — kalau tidak dibersihkan,
 *  kode ANSI mentah ("\x1b[31m" dst) ikut kesimpen dan bikin pesan error berantakan dibaca di UI. */
function stripAnsiCodes(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, "")
}

function tryExtractTimestamp(line: string): Date | null {
  const m = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/.exec(line)
  if (!m) return null
  const d = new Date(m[1].replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Scan log container 1 aplikasi buat baris yang kelihatan seperti error — heuristik kata kunci
 *  sederhana (bukan parser terstruktur per framework, tiap aplikasi bisa beda format log-nya),
 *  best-effort sama seperti isNoiseRequest() di traefik-access.ts. Window [since, until) EKSPLISIT
 *  (sama pola dengan collectTrafficWindow) — dipanggil dengan window pendek per jam supaya tidak
 *  kalah cepat dari rotasi log Docker di VPS ramai. */
async function collectApplicationErrors(vps: VpsSshLike, containerName: string, since: Date, until: Date): Promise<{ message: string; occurredAt: Date }[]> {
  const creds = vpsSshCreds(vps)
  let logs: string
  try {
    logs = await sshExec(
      creds,
      `${sudoWrap(creds.password, `docker logs ${containerName} --since '${since.toISOString()}' --until '${until.toISOString()}' 2>&1`)} | grep -iE 'error|exception|fatal|panic' | tail -n 500`,
      20000
    )
  } catch {
    return []
  }

  return logs
    .split("\n")
    .map((l) => stripAnsiCodes(l).trim())
    .filter((l) => l && ERROR_PATTERN.test(l) && !DOCKER_CLI_ERROR_PATTERN.test(l))
    .map((line) => ({ message: line.slice(0, 2000), occurredAt: tryExtractTimestamp(line) ?? until }))
}

/** Kumpulkan error log SEMUA aplikasi yang punya container ter-resolve (dari cache Docker disk
 *  VPS-nya, lihat VpsServer.dockerDiskCache) — dipanggil cron TIAP JAM, pola cursor-per-entitas
 *  yang sama dengan runApplicationTrafficIncrement() (window [Application.errorLogCollectedUntil,
 *  now), bukan window mundur tetap, supaya baris log yang sama tidak ke-scan ulang tiap jalan).
 *  Sekalian bersihkan log lebih dari 30 hari di akhir tiap jalan, supaya tabelnya tidak numpuk
 *  tanpa batas. `referenceDate` dependency-injectable buat testing manual. */
export async function runApplicationErrorLogCollection(referenceDate: Date = new Date()) {
  const until = referenceDate
  const oldestAllowed = new Date(until.getTime() - MAX_LOOKBACK_MS)

  const vpsList = await prisma.vpsServer.findMany({
    include: { applications: { where: { coolifyUuid: { not: null } } } },
  })

  let logsStored = 0
  for (const vps of vpsList) {
    const cache = vps.dockerDiskCache as unknown as { containers?: { containerName: string; coolifyAppUuid: string | null }[] } | null
    if (!cache?.containers || vps.applications.length === 0) continue

    for (const app of vps.applications) {
      const container = cache.containers.find((c) => c.coolifyAppUuid === app.coolifyUuid)
      if (!container) continue

      const since = !app.errorLogCollectedUntil
        ? new Date(until.getTime() - FALLBACK_LOOKBACK_MS)
        : app.errorLogCollectedUntil > oldestAllowed
          ? app.errorLogCollectedUntil
          : oldestAllowed
      if (since >= until) continue

      try {
        const errors = await collectApplicationErrors(vps, container.containerName, since, until)
        if (errors.length > 0) {
          await prisma.applicationErrorLog.createMany({
            data: errors.map((e) => ({ applicationId: app.id, message: e.message, occurredAt: e.occurredAt })),
          })
          logsStored += errors.length
        }
        await prisma.application.update({ where: { id: app.id }, data: { errorLogCollectedUntil: until } }).catch(() => {})
      } catch (e) {
        console.error(`[application-error-logs] gagal untuk aplikasi "${app.name}":`, e)
      }
    }
  }

  await prisma.applicationErrorLog.deleteMany({ where: { occurredAt: { lt: new Date(until.getTime() - RETENTION_MS) } } }).catch(() => {})

  return { logsStored }
}
