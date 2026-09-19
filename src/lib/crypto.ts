import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_LEN = 12
const TAG_LEN = 16

/** ENCRYPTION_KEY di-hash SHA-256 dulu supaya selalu jadi persis 32 byte apa pun panjang/format
 *  yang diisi user di .env (tidak perlu hex/base64 presisi 32 byte). WAJIB diset di env — kalau
 *  kosong, semua enkripsi/dekripsi kredensial VPS (lihat src/lib/monitoring/ssh.ts,
 *  src/lib/monitoring/coolify.ts) akan gagal. */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error("ENCRYPTION_KEY belum diset di environment")
  return createHash("sha256").update(raw).digest()
}

/** Enkripsi AES-256-GCM, output base64 tunggal berisi iv+authTag+ciphertext — dipakai buat
 *  kredensial VPS/Coolify (VpsServer.sshPassword/sshPrivateKey/coolifyApiToken) sebelum disimpan
 *  ke database, supaya kalau database (yang dipakai bersama app lain, lihat catatan schema.prisma)
 *  kebaca pihak lain, yang kelihatan cuma ciphertext — bukan kredensial asli. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString("base64")
}

/** Dekripsi hasil encryptSecret(). Fallback: kalau gagal didekripsi (format tidak cocok / bukan
 *  hasil encryptSecret sama sekali), kembalikan apa adanya — dipakai supaya data lama yang sempat
 *  tersimpan plaintext (sebelum enkripsi ini ada) tetap bisa dipakai connect sampai user re-save
 *  lewat form Edit, baru ke-enkripsi dengan skema baru. */
export function decryptSecret(value: string): string {
  try {
    const buf = Buffer.from(value, "base64")
    if (buf.length < IV_LEN + TAG_LEN) return value
    const iv = buf.subarray(0, IV_LEN)
    const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const encrypted = buf.subarray(IV_LEN + TAG_LEN)
    const decipher = createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
  } catch {
    return value
  }
}
