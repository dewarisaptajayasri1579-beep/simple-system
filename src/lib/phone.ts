/** Ubah nomor HP lokal (08xx) jadi format internasional (62xx) yang dipakai wa.me — dipakai di
 *  semua tombol "buka wa.me" client-side (beda dari `normalizePhoneNumber` di wahub.ts yang
 *  dipakai server-side buat panggil WAHUB). */
export function normalizePhoneForWaMe(raw: string) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}
