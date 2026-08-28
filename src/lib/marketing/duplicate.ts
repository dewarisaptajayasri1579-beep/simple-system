import { prisma } from "@/lib/prisma"

/**
 * Deteksi lead duplikat per nomor WhatsApp (docs/06 §28). Bukan sekadar unique constraint:
 *  - Prioritaskan lead OPEN paling baru interaksinya.
 *  - Kalau tidak ada OPEN, pakai lead WON/LOST terakhir HANYA kalau masih "recent"
 *    (`reopenWindowDays`) — customer yang sama menghubungi lagi → lanjut di lead itu.
 *  - Selain itu → tidak ada match (caller buat lead baru).
 */
export async function findDuplicateLead(
  whatsappNumber: string,
  opts: { reopenWindowDays?: number } = {},
): Promise<{ leadId: string; outcome: string; displayName: string } | null> {
  const open = await prisma.lead.findFirst({
    where: { whatsappNumber, outcome: "OPEN" },
    orderBy: [{ lastInteractionAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, outcome: true, displayName: true },
  })
  if (open) return { leadId: open.id, outcome: open.outcome, displayName: open.displayName }

  const windowDays = opts.reopenWindowDays ?? 90
  const cutoff = new Date(Date.now() - windowDays * 86400000)
  const recentClosed = await prisma.lead.findFirst({
    where: { whatsappNumber, OR: [{ wonAt: { gte: cutoff } }, { lostAt: { gte: cutoff } }] },
    orderBy: { updatedAt: "desc" },
    select: { id: true, outcome: true, displayName: true },
  })
  if (recentClosed) return { leadId: recentClosed.id, outcome: recentClosed.outcome, displayName: recentClosed.displayName }

  return null
}
