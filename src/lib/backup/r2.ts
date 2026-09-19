import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

/** Key S3-nya "{YYYY-MM}/seven-os-backup-{YYYY-MM-DD}.json.gz" — R2 tidak punya folder asli,
 *  tapi prefix ber-"/" ini ditampilkan sebagai folder di dashboard R2 (mis. "2026-09/"). */
const KEY_RE = /^(\d{4}-\d{2})\/(seven-os-backup-\d{4}-\d{2}-(\d{2})\.json\.gz)$/

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} belum di-set`)
  return value
}

/** Cloudflare R2 — S3-compatible, endpoint-nya spesifik per akun (R2_ACCOUNT_ID), region selalu "auto". */
function s3Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_KEY"),
    },
  })
}

function bucketName() {
  return requiredEnv("R2_BACKUP_BUCKET")
}

/** fileName "seven-os-backup-YYYY-MM-DD.json.gz" -> key "YYYY-MM/seven-os-backup-YYYY-MM-DD.json.gz". */
function keyForFile(fileName: string) {
  const match = fileName.match(/^seven-os-backup-(\d{4}-\d{2})-\d{2}\.json\.gz$/)
  if (!match) throw new Error(`Nama file backup tidak sesuai pola: ${fileName}`)
  return `${match[1]}/${fileName}`
}

async function listAllBackupObjects(client: S3Client) {
  const bucket = bucketName()
  const objects: _Object[] = []
  let token: string | undefined
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    objects.push(...(res.Contents ?? []))
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return objects
}

/** Upload 1 file backup ke bucket R2, otomatis masuk folder bulan-tahunnya. */
export async function uploadBackupFile(fileName: string, buffer: Buffer, mimeType: string) {
  const client = s3Client()
  const key = keyForFile(fileName)
  await client.send(new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: buffer, ContentType: mimeType }))
  return { key }
}

/** List file backup terbaru — dipakai kartu "Backup Terakhir" di Monitoring Server. webViewLink
 *  berupa presigned URL (berlaku 1 jam) karena bucket R2 private, bukan link publik permanen. */
export async function listRecentBackups(limit = 5) {
  const client = s3Client()
  const objects = (await listAllBackupObjects(client)).filter((obj) => obj.Key && KEY_RE.test(obj.Key))
  objects.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
  const recent = objects.slice(0, limit)

  return Promise.all(
    recent.map(async (obj) => {
      const key = obj.Key!
      const fileName = key.match(KEY_RE)![2]
      return {
        id: key,
        name: fileName,
        createdTime: obj.LastModified?.toISOString() ?? null,
        sizeBytes: obj.Size ?? null,
        webViewLink: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucketName(), Key: key }), {
          expiresIn: 3600,
        }),
      }
    })
  )
}

/** Retensi: bulan yang sudah lewat (bukan bulan berjalan) cuma disisakan 1 file — tanggal
 *  terakhir yang ada di bulan itu, sisanya dihapus. Bulan berjalan tetap disimpan harian.
 *  Dipanggil tiap habis upload backup harian (lihat database-backup.ts) supaya bucket rapi
 *  otomatis tanpa perlu cron terpisah. */
export async function cleanupOldBackups() {
  const client = s3Client()
  const objects = await listAllBackupObjects(client)

  const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(
    new Date()
  )

  const byMonth = new Map<string, { key: string; day: string }[]>()
  for (const obj of objects) {
    if (!obj.Key) continue
    const match = obj.Key.match(KEY_RE)
    if (!match) continue
    const [, month, , day] = match
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push({ key: obj.Key, day })
  }

  const keysToDelete: string[] = []
  for (const [month, files] of byMonth) {
    if (month >= currentMonth) continue
    files.sort((a, b) => a.day.localeCompare(b.day))
    const lastDayKey = files[files.length - 1].key
    for (const f of files) if (f.key !== lastDayKey) keysToDelete.push(f.key)
  }

  if (keysToDelete.length === 0) return { deletedCount: 0 }

  await client.send(
    new DeleteObjectsCommand({ Bucket: bucketName(), Delete: { Objects: keysToDelete.map((Key) => ({ Key })) } })
  )

  return { deletedCount: keysToDelete.length }
}
