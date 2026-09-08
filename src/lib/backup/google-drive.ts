import { Readable } from "stream"
import { google } from "googleapis"

/** Service Account TIDAK BISA upload ke Drive akun personal (Gmail biasa) — Google balikin
 *  403 "Service Accounts do not have storage quota" kecuali pakai Shared Drive (Google
 *  Workspace only). Jadi backup ini pakai OAuth ke akun Google pribadi langsung (refresh token
 *  hasil otorisasi sekali lewat scripts/google-oauth-authorize.ts), bukan Service Account —
 *  filenya kesimpan di Drive kamu sendiri, pakai kuota kamu sendiri. */
function oauthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN belum di-set")
  }
  const client = new google.auth.OAuth2(clientId, clientSecret)
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

function driveClient() {
  return google.drive({ version: "v3", auth: oauthClient() })
}

/** Upload 1 file ke folder Drive tujuan (folder ID dari GOOGLE_DRIVE_BACKUP_FOLDER_ID, milik
 *  akun Google yang sama dengan yang dipakai otorisasi). Scope "drive.file" cukup — cuma butuh
 *  akses file yang dibuat app ini sendiri, bukan seluruh Drive user. */
export async function uploadBackupFile(fileName: string, buffer: Buffer, mimeType: string) {
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!folderId) throw new Error("GOOGLE_DRIVE_BACKUP_FOLDER_ID belum di-set")

  const drive = driveClient()
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
  })

  return { fileId: res.data.id!, webViewLink: res.data.webViewLink ?? null }
}

/** List file backup terbaru di folder Drive tujuan — dipakai kartu "Backup Terakhir" di
 *  Monitoring Server supaya kelihatan kapan cron 20:00 WIB (lihat instrumentation.ts) betulan
 *  berhasil upload, bukan cuma percaya proses cron-nya jalan. Scope "drive.file" cukup buat list
 *  ini karena semua file di folder dibuat lewat OAuth client yang sama (lihat uploadBackupFile). */
export async function listRecentBackups(limit = 5) {
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!folderId) throw new Error("GOOGLE_DRIVE_BACKUP_FOLDER_ID belum di-set")

  const drive = driveClient()
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: "createdTime desc",
    pageSize: limit,
    fields: "files(id, name, createdTime, size, webViewLink)",
  })

  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name ?? "",
    createdTime: f.createdTime ?? null,
    sizeBytes: f.size ? Number(f.size) : null,
    webViewLink: f.webViewLink ?? null,
  }))
}
