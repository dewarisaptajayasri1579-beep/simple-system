import { prisma } from "@/lib/prisma"

/** Resolve beberapa User.id (createdById/postedById/voidedById dkk — semuanya cuma disimpan
 *  sebagai string mentah, bukan relasi FK) jadi nama, sekali query buat semuanya. Dipakai di
 *  halaman detail Invoice/Payment/Transaction/Pindah Buku/Jurnal Umum buat nampilin "Dibuat
 *  oleh/Diposting oleh/Dibatalkan oleh". User yang sudah dihapus (id tidak ketemu) fallback ke
 *  null, caller yang decide fallback text-nya (mis. "-"). */
export async function resolveUserNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return new Map()

  const users = await prisma.user.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } })
  return new Map(users.map((u) => [u.id, u.name]))
}
