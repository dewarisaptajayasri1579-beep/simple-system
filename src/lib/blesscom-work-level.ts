/** Tipe & helper label level harga Blesscom — sengaja TANPA import prisma supaya aman dipakai
 *  komponen client juga (query katalognya ada di blesscom-level-catalog.ts, server-only). */

export interface BlesscomLevelOption {
  id: string
  groupName: string
  level: string | null
  label: string
  /** Harga kesepakatan Blesscom (WorkPriceItem.blesscomPrice) — bukan `price` hasil rubrik bobot. */
  price: number
}

/** Label kategori+level — "hasil akhir" yang dipakai Blesscom, sama dengan menu Pengajuan Pekerjaan. */
export function blesscomLevelLabel(it: { groupName: string; level: string | null; label: string }): string {
  return it.level ? `${it.groupName} — ${it.level}` : it.label
}

/** Isi kolom "Level": nama levelnya, atau label itemnya untuk item yang tidak bertingkat
 *  (mis. "Setup Website") — supaya kolom Level tidak pernah kosong. */
export function blesscomLevelName(it: { level: string | null; label: string }): string {
  return it.level ?? it.label
}
