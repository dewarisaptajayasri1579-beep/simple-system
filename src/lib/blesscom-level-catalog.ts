import type { BlesscomLevelOption } from "@/lib/blesscom-work-level"
import { prisma } from "@/lib/prisma"

/**
 * Daftar level yang boleh dipakai untuk pekerjaan Blesscom: HANYA item pricelist yang punya
 * `blesscomPrice` (harga yang sudah jadi kesepakatan). Item tanpa blesscomPrice memang tidak ada
 * di daftar harga Blesscom, jadi tidak ditawarkan — lihat komentar WorkPriceItem.blesscomPrice.
 *
 * Server-only (query prisma) — helper label-nya ada di blesscom-work-level.ts supaya komponen
 * client tidak ikut menarik prisma ke bundle.
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
