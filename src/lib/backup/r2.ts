import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const PREFIX = "seven-os-backup-"
const FILE_RE = /^seven-os-backup-(\d{4}-\d{2})-(\d{2})\.json\.gz$/

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
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  })
}

function bucketName() {
  return requiredEnv("R2_BACKUP_BUCKET")
}

async function listAllBackupObjects(client: S3Client) {
  const bucket = bucketName()
  const objects: _Object[] = []
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token })
    )
    objects.push(...(res.Contents ?? []))
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return objects
}

/** Upload 1 file backup ke bucket R2. */
export async function uploadBackupFile(fileName: string, buffer: Buffer, mimeType: string) {
  const client = s3Client()
  await client.send(new PutObjectCommand({ Bucket: bucketName(), Key: fileName, Body: buffer, ContentType: mimeType }))
  return { key: fileName }
}

/** List file backup terbaru — dipakai kartu "Backup Terakhir" di Monitoring Server. webViewLink
 *  berupa presigned URL (berlaku 1 jam) karena bucket R2 private, bukan link publik permanen. */
export async function listRecentBackups(limit = 5) {
  const client = s3Client()
  const objects = await listAllBackupObjects(client)
  objects.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
  const recent = objects.slice(0, limit)

  return Promise.all(
    recent.map(async (obj) => ({
      id: obj.Key!,
      name: obj.Key!,
      createdTime: obj.LastModified?.toISOString() ?? null,
      sizeBytes: obj.Size ?? null,
      webViewLink: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucketName(), Key: obj.Key! }), {
        expiresIn: 3600,
      }),
    }))
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
    const match = obj.Key?.match(FILE_RE)
    if (!match || !obj.Key) continue
    const [, month, day] = match
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
