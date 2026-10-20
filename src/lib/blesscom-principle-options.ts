import { prisma } from "@/lib/prisma"

/**
 * Opsi dropdown principle untuk form pekerjaan Blesscom — principle AKTIF dari semua perusahaan
 * per-principle (Blesscom & Blessfull), dengan nama perusahaan ikut di label supaya principle
 * bernama mirip di dua perusahaan tidak tertukar.
 */
export async function getPrincipleOptions(): Promise<{ value: string; label: string }[]> {
  const principles = await prisma.principle.findMany({
    where: { active: true },
    orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, company: { select: { name: true } } },
  })
  return principles.map((p) => ({ value: p.id, label: `${p.name} · ${p.company.name}` }))
}
