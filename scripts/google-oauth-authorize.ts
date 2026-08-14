/**
 * Jalankan SEKALI di komputer lokal untuk dapat refresh token Google OAuth (backup database ->
 * Drive, lihat src/lib/backup/google-drive.ts). Buka URL yang ditampilkan, login pakai akun
 * Google yang jadi tujuan backup, klik Allow — refresh token-nya otomatis ke-print di terminal.
 *
 * Butuh GOOGLE_OAUTH_CLIENT_ID & GOOGLE_OAUTH_CLIENT_SECRET (dari file client_secret_*.json,
 * OAuth client tipe "Desktop app") sudah ada di .env sebelum dijalankan:
 *   npx tsx scripts/google-oauth-authorize.ts
 */
import { createServer } from "http"
import { google } from "googleapis"

const CLIENT_ID = requireEnv("GOOGLE_OAUTH_CLIENT_ID")
const CLIENT_SECRET = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET")
const PORT = 53682

function requireEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} belum di-set di .env`)
  return v
}

async function main() {
  const redirectUri = `http://localhost:${PORT}`
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri)

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // paksa Google selalu keluarin refresh_token, bukan cuma pas otorisasi pertama
    scope: ["https://www.googleapis.com/auth/drive.file"],
  })

  console.log("\nBuka URL ini di browser, login pakai akun Google tujuan backup:\n")
  console.log(authUrl)
  console.log("\nMenunggu otorisasi...\n")

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", redirectUri)
      const code = url.searchParams.get("code")
      const error = url.searchParams.get("error")
      res.end(error ? "Gagal otorisasi, cek terminal." : "Berhasil! Boleh tutup tab ini, cek terminal.")
      server.close()
      if (error) reject(new Error(error))
      else if (code) resolve(code)
    })
    server.listen(PORT)
  })

  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    console.error("\nTidak dapat refresh_token — coba lagi, pastikan ini otorisasi pertama kali (atau cabut akses lama di myaccount.google.com/permissions lalu ulangi).")
    process.exit(1)
  }

  console.log("\nRefresh token (simpan sebagai GOOGLE_OAUTH_REFRESH_TOKEN di .env & Coolify):\n")
  console.log(tokens.refresh_token)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
