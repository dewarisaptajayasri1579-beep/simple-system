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
