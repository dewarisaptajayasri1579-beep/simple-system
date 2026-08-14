/** Ubah nomor HP lokal (08xx) jadi format internasional (62xx) yang dipakai wa.me — dipakai di
 *  semua tombol "buka wa.me" client-side (beda dari `normalizePhoneNumber` di wahub.ts yang
 *  dipakai server-side buat panggil WAHUB). */
export function normalizePhoneForWaMe(raw: string) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

/** URL "buka WhatsApp" buat tombol-tombol client-side (Kirim WhatsApp, follow-up Manual, dst).
 *  Sengaja web.whatsapp.com/send, BUKAN wa.me — wa.me redirect ke api.whatsapp.com, dan di Safari/
 *  macOS domain itu terdaftar sebagai universal link yang otomatis nawarin buka WhatsApp Desktop
 *  (app native), bukan WhatsApp Web di browser. web.whatsapp.com tidak terdaftar sebagai universal
 *  link, jadi selalu buka di tab browser seperti yang dimaksud. */
export function waWebUrl(phone: string, text: string) {
  return `https://web.whatsapp.com/send?phone=${normalizePhoneForWaMe(phone)}&text=${encodeURIComponent(text)}`;
}
