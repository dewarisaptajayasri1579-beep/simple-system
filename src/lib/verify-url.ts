import QRCode from "qrcode"

const APP_BASE_URL = process.env.APP_BASE_URL || "https://simple.onyseven.com"

export function invoiceVerifyUrl(invoiceNumber: string) {
  return `${APP_BASE_URL}/verify/invoice/${encodeURIComponent(invoiceNumber)}`
}

export function kwitansiVerifyUrl(paymentNumber: string) {
  return `${APP_BASE_URL}/verify/kwitansi/${encodeURIComponent(paymentNumber)}`
}

/** QR code sebagai data URL (PNG base64) — dirender server-side supaya bisa langsung dipakai
 *  di <img src>, tidak butuh request eksternal saat print (penting buat "Print to PDF" offline). */
export async function qrCodeDataUrl(text: string) {
  return QRCode.toDataURL(text, { margin: 1, width: 200 })
}
