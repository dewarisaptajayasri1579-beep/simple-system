import { analyzeLead } from "@/lib/marketing/ai"
import { prisma } from "@/lib/prisma"

/**
 * AI auto-reanalysis (docs/02 §19) — tiap ~10 menit, analisa ulang lead OPEN yang punya
 * aktivitas / pesan / follow-up baru sejak analisa AI terakhir. Pakai model FAST (Haiku).
 * Dibatasi 12 lead per run supaya biaya & rate limit terkendali.
 */
const BATCH = 12
const STALE_MS = 10 * 60 * 1000 // jangan re-analisa lebih sering dari 10 menit

export async function runMarketingAiReanalysis() {
  if (!process.env.ANTHROPIC_API_KEY) return { analyzed: 0, skipped: "no api key" }

  const since = new Date(Date.now() - STALE_MS)

  // Kandidat: lead OPEN dengan pesan terbaru, ada interaksi baru dalam 24 jam terakhir,
  // dan analisa AI terakhir (kalau ada) lebih lama dari interaksi itu.
  const day = new Date(Date.now() - 24 * 3600 * 1000)
  const leads = await prisma.lead.findMany({
    where: {
      outcome: "OPEN",
      lastInteractionAt: { gte: day, lt: since },
      conversations: { some: { messages: { some: {} } } },
    },
    orderBy: { lastInteractionAt: "desc" },
    take: 60,
    select: {
      id: true,
      lastInteractionAt: true,
      aiAnalyses: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  })

  const stale = leads
    .filter((l) => {
      const lastAi = l.aiAnalyses[0]?.createdAt
      return !lastAi || (l.lastInteractionAt != null && l.lastInteractionAt > lastAi)
    })
    .slice(0, BATCH)

  let analyzed = 0
  for (const l of stale) {
    try {
      await analyzeLead(l.id)
      analyzed++
    } catch {
      /* per-lead gagal tidak menghentikan batch */
    }
  }
  return { analyzed, candidates: stale.length }
}
