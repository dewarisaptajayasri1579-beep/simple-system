import { prisma } from "@/lib/prisma"

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

/**
 * Daftar level yang boleh dipakai untuk pekerjaan Blesscom: HANYA item pricelist yang punya
 * `blesscomPrice` (harga yang sudah jadi kesepakatan). Item tanpa blesscomPrice memang tidak ada
 * di daftar harga Blesscom, jadi tidak ditawarkan — lihat komentar WorkPriceItem.blesscomPrice.
 */
export async function getBlesscomLevelOptions(): Promise<BlesscomLevelOption[]> {
  const rows = await prisma.workPriceItem.findMany({
    where: { active: true, blesscomPrice: { not: null } },
    orderBy: [{ groupName: "asc" }, { sortOrder: "asc" }],
    select: { id: true, groupName: true, level: true, label: true, blesscomPrice: true },
  })
  return rows.map((r) => ({
    id: r.id,
    groupName: r.groupName,
    level: r.level,
    label: r.label,
    price: r.blesscomPrice as number,
  }))
}
