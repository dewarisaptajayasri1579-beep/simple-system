import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

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

/** Bucket default (dipakai backup app ini sendiri + VPS yang belum diisi `r2BucketName` sendiri —
 *  lihat VpsServer.r2BucketName di schema). Semua fungsi di file ini terima `bucket` opsional yang
 *  fallback ke ini, jadi caller lama (backup app sendiri) tidak perlu berubah sama sekali. */
function defaultBucketName() {
  return requiredEnv("R2_BACKUP_BUCKET")
}

/** Bikin bucket R2 baru kalau belum ada — dipakai waktu VPS di-set pakai `r2BucketName` sendiri
 *  (lihat ensureDatabaseBackupsOnBucket() di src/lib/monitoring/coolify.ts). Aman dipanggil
 *  berkali-kali: R2 balikin BucketAlreadyOwnedByYou kalau sudah ada punya akun yang sama, itu
 *  ditangkap sebagai sukses (bukan error), bukan kondisi gagal. */
export async function ensureBucketExists(bucket: string): Promise<void> {
  const client = s3Client()
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
  } catch (e) {
    if (e instanceof BucketAlreadyOwnedByYou) return
    // R2 kadang balikin error generik "BucketAlreadyExists" (bukan exception class khusus SDK)
    // kalau bucket sudah ada — cek pesan mentahnya juga, bukan cuma instanceof.
    const message = e instanceof Error ? e.message : String(e)
    if (/BucketAlreadyExists|BucketAlreadyOwnedByYou/i.test(message)) return
    throw e
  }
}

async function listAllObjects(client: S3Client, bucket: string) {
  const objects: _Object[] = []
  let token: string | undefined
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    objects.push(...(res.Contents ?? []))
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return objects
}

/** "group" = folder tempat 1 sumber backup tertentu naruh file-nya — untuk backup app ini sendiri
 *  itu "seven-os", untuk backup native Coolify itu path lengkap yang Coolify pakai sendiri
 *  (mis. "databases/dewari-1/mariadb-xyz"). Dipakai buat kelompokkan riwayat & retensi bulanan,
 *  supaya kode ini tidak perlu tahu format nama file tiap engine database (Postgres/MariaDB/dst
 *  beda-beda pola nama filenya). */
function groupOf(key: string) {
  const idx = key.lastIndexOf("/")
  return idx === -1 ? "" : key.slice(0, idx)
}

/** Upload 1 file backup ke bucket R2, di bawah folder `group` (lihat groupOf). `bucket` opsional,
 *  default ke bucket global (backup app ini sendiri) — VPS lain lewat ensureDatabaseBackupsOnBucket
 *  di coolify.ts, bukan lewat fungsi ini (itu Coolify sendiri yang upload). */
export async function uploadBackupFile(group: string, fileName: string, buffer: Buffer, mimeType: string, bucket = defaultBucketName()) {
  const client = s3Client()
  const key = `${group}/${fileName}`
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }))
  return { key }
}

/** Riwayat backup di R2, dikelompokkan per `group` (per sumber/database) — dipakai kartu
 *  "Riwayat Backup" di Monitoring Server. webViewLink berupa presigned URL (berlaku 1 jam)
 *  karena bucket R2 private. filesPerGroup membatasi berapa file terbaru yang ditampilkan
 *  per group (bukan total keseluruhan, supaya payload tidak membengkak). `bucket` opsional,
 *  default ke bucket global. */
export async function listBackupHistory(filesPerGroup = 10, bucket = defaultBucketName()) {
  const client = s3Client()
  const objects = (await listAllObjects(client, bucket)).filter((obj) => obj.Key)

  const byGroup = new Map<string, _Object[]>()
  for (const obj of objects) {
    const group = groupOf(obj.Key!)
    if (!byGroup.has(group)) byGroup.set(group, [])
    byGroup.get(group)!.push(obj)
  }

  const groups = await Promise.all(
    Array.from(byGroup.entries()).map(async ([group, objs]) => {
      objs.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
      const recent = objs.slice(0, filesPerGroup)
      const files = await Promise.all(
        recent.map(async (obj) => ({
          id: obj.Key!,
          name: obj.Key!.slice(group.length + 1),
          createdTime: obj.LastModified?.toISOString() ?? null,
          sizeBytes: obj.Size ?? null,
          webViewLink: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: obj.Key! }), {
            expiresIn: 3600,
          }),
        }))
      )
      return { group, totalFiles: objs.length, files }
    })
  )

  groups.sort((a, b) => (b.files[0]?.createdTime ?? "").localeCompare(a.files[0]?.createdTime ?? ""))
  return groups
}

/** File terbaru per group, 1 entry per group (bukan riwayat) — dipakai kolom "DB Backup" di
 *  tabel Aplikasi (dicocokkan ke Application.databaseUuid lewat group.endsWith(uuid), lihat
 *  GET /api/monitoring/vps). Terpisah dari listBackupHistory supaya tidak generate presigned
 *  URL utk file yang tidak dipakai. `bucket` opsional, default ke bucket global — GET
 *  /api/monitoring/vps panggil ini SEKALI PER BUCKET UNIK (bukan per VPS) buat gabungin hasil
 *  semua VPS yang bucket-nya beda (lihat r2BucketName di schema), bukan cuma satu bucket global. */
export async function latestBackupPerGroup(bucket = defaultBucketName()) {
  const client = s3Client()
  const objects = (await listAllObjects(client, bucket)).filter((obj) => obj.Key && obj.LastModified)

  const latestByGroup = new Map<string, _Object>()
  for (const obj of objects) {
    const group = groupOf(obj.Key!)
    const current = latestByGroup.get(group)
    if (!current || obj.LastModified!.getTime() > current.LastModified!.getTime()) latestByGroup.set(group, obj)
  }

  return Promise.all(
    Array.from(latestByGroup.entries()).map(async ([group, obj]) => ({
      group,
      fileName: obj.Key!.slice(group.length + 1),
      createdTime: obj.LastModified!.toISOString(),
      webViewLink: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: obj.Key! }), {
        expiresIn: 3600,
      }),
    }))
  )
}

/** Retensi: per group, bulan yang sudah lewat (bukan bulan berjalan) cuma disisakan 1 file —
 *  yang LastModified-nya paling akhir di bulan itu, sisanya dihapus. Bulan berjalan tetap
 *  disimpan apa adanya (harian atau berapa pun frekuensinya). Dipanggil oleh cron tanggal 1
 *  (lihat instrumentation.ts) — cukup sebulan sekali karena bulan yang sudah lewat tidak
 *  bertambah file baru lagi. `bucket` opsional, default ke bucket global — cron-nya sendiri loop
 *  semua bucket yang dipakai (global + tiap r2BucketName unik di VpsServer). */
export async function cleanupOldBackups(bucket = defaultBucketName()) {
  const client = s3Client()
  const objects = await listAllObjects(client, bucket)

  const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(
    new Date()
  )
  const monthOf = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(d)

  const byGroupMonth = new Map<string, { key: string; time: number }[]>()
  for (const obj of objects) {
    if (!obj.Key || !obj.LastModified) continue
    const group = groupOf(obj.Key)
    const month = monthOf(obj.LastModified)
    if (month >= currentMonth) continue
    const mapKey = `${group}::${month}`
    if (!byGroupMonth.has(mapKey)) byGroupMonth.set(mapKey, [])
    byGroupMonth.get(mapKey)!.push({ key: obj.Key, time: obj.LastModified.getTime() })
  }

  const keysToDelete: string[] = []
  for (const files of byGroupMonth.values()) {
    files.sort((a, b) => a.time - b.time)
    const lastKey = files[files.length - 1].key
    for (const f of files) if (f.key !== lastKey) keysToDelete.push(f.key)
  }

  if (keysToDelete.length === 0) return { deletedCount: 0 }

  // DeleteObjects maksimal 1000 key per request.
  for (let i = 0; i < keysToDelete.length; i += 1000) {
    const batch = keysToDelete.slice(i, i + 1000)
    await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })) } }))
  }

  return { deletedCount: keysToDelete.length }
}
