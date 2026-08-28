import { prisma } from "@/lib/prisma"

/**
 * Saran tier Kemampuan Beli berbasis analisa AI — SUGGEST_ONLY (tidak pernah auto-apply).
 *
 * Sumbernya angka `buyingPower` (0-100) dari LeadAiAnalysis type PROFILING yang sudah dihasilkan
 * `analyzeLead` (lihat ai.ts). Di sini deterministik: petakan angka itu ke `LeadBuyingPowerTier`
 * aktif dengan `normalizedScore` terdekat, lalu simpan sebagai LeadAiAnalysis type
 * BUYING_POWER_RECOMMENDATION. Sales yang menekan "Terapkan" di UI.
 */
export const BUYING_POWER_RULE_VERSION = "buying-power-v1"

export interface BuyingPowerSuggestion {
  score: number
  suggestedTierId: string
  suggestedTierCode: string
  suggestedTierName: string
  companySize: string | null
  reason: string
}

function toScore(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return v <= 1 ? v * 100 : v
}

export async function recomputeBuyingPowerSuggestion(leadId: string): Promise<BuyingPowerSuggestion | null> {
  const [lead, profiling, tiers] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId }, select: { outcome: true } }),
    prisma.leadAiAnalysis.findFirst({
      where: { leadId, analysisType: "PROFILING", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { outputJson: true },
    }),
    prisma.leadBuyingPowerTier.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, normalizedScore: true },
    }),
  ])
  if (!lead || lead.outcome !== "OPEN") return null
  if (!profiling || tiers.length === 0) return null

  const prof = (profiling.outputJson ?? {}) as Record<string, unknown>
  const score = toScore(prof.buyingPower)
  if (score == null) return null
  const companySize = typeof prof.companySize === "string" ? prof.companySize : null

  const best = tiers.reduce((a, b) =>
    Math.abs(b.normalizedScore - score) < Math.abs(a.normalizedScore - score) ? b : a,
  )

  const reason = `Estimasi AI kapasitas ${Math.round(score)}/100${companySize ? ` · ukuran usaha: ${companySize}` : ""}`

  const suggestion: BuyingPowerSuggestion = {
    score: Math.round(score),
    suggestedTierId: best.id,
    suggestedTierCode: best.code,
    suggestedTierName: best.name,
    companySize,
    reason,
  }

  // Hindari spam baris identik: skip tulis kalau saran terakhir sama persis.
  const last = await prisma.leadAiAnalysis.findFirst({
    where: { leadId, analysisType: "BUYING_POWER_RECOMMENDATION" },
    orderBy: { version: "desc" },
    select: { version: true, outputJson: true },
  })
  const lastOut = (last?.outputJson ?? {}) as Record<string, unknown>
  if (lastOut.suggestedTierId === best.id && lastOut.score === suggestion.score) return suggestion

  await prisma.leadAiAnalysis.create({
    data: {
      leadId,
      analysisType: "BUYING_POWER_RECOMMENDATION",
      version: (last?.version ?? 0) + 1,
      modelName: "rule",
      promptVersion: BUYING_POWER_RULE_VERSION,
      outputJson: { ...suggestion },
      status: "SUCCESS",
    },
  })

  return suggestion
}
