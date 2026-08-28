import { prisma } from "@/lib/prisma"
import { recencyScore } from "@/lib/marketing/priority"

/**
 * Temperature Signal Score 0-100 — `docs/06-business-rule.md` §4-§6, §39.
 * Beda dari Priority Score. Komponen: AI Buying Interest 30% · Need 20% · Activity Stage 25% ·
 * Latest Follow Up Result 15% · Customer Recency 10%. Mapping: 0-39 Cold, 40-69 Warm, 70-100 Hot.
 *
 * Mode baseline = SUGGEST_ONLY (keputusan project): sistem TIDAK pernah mengubah `Lead.temperature`
 * otomatis — hanya menyimpan saran (`LeadAiAnalysis` type TEMPERATURE_RECOMMENDATION) untuk
 * ditampilkan + tombol "Terapkan" manual. Strong signal (§5) langsung menyarankan HOT.
 */
export const TEMPERATURE_RULE_VERSION = "temp-v1"

const STAGE_SCORE: Record<string, number> = { NONE: 0, DISCUSSION: 20, ZOOM_DEMO: 55, PROPOSAL: 75, NEGOTIATION: 90 }

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n))
}

export function levelForSignal(score: number): "COLD" | "WARM" | "HOT" {
  if (score >= 70) return "HOT"
  if (score >= 40) return "WARM"
  return "COLD"
}

interface TemperatureInput {
  aiBuyingInterest: number | null // 0..100
  need: number | null // 0..100
  currentActivityStage: string
  followUpNormalizedScore: number | null
  lastInteractionAt: Date | null
  firstContactAt: Date
  strongSignal: boolean
  now?: Date
}

export interface TemperatureSignalResult {
  score: number
  suggestedLevel: "COLD" | "WARM" | "HOT"
  strongSignal: boolean
  components: { aiInterest: number; need: number; activity: number; followUp: number; recency: number }
  reasons: string[]
}

export function computeTemperatureSignal(input: TemperatureInput): TemperatureSignalResult {
  const now = input.now ?? new Date()
  const aiInterest = input.aiBuyingInterest == null ? 50 : clamp(input.aiBuyingInterest)
  const need = input.need == null ? 50 : clamp(input.need)
  const activity = STAGE_SCORE[input.currentActivityStage] ?? 0
  const followUp = input.followUpNormalizedScore == null ? 50 : clamp(input.followUpNormalizedScore)

  const ref = input.lastInteractionAt ?? input.firstContactAt
  const idleDays = Math.max(0, (now.getTime() - ref.getTime()) / 86400000)
  const recency = recencyScore(idleDays)

  const score = Math.round(aiInterest * 0.3 + need * 0.2 + activity * 0.25 + followUp * 0.15 + recency * 0.1)
  const suggestedLevel = input.strongSignal ? "HOT" : levelForSignal(score)

  const reasons: string[] = []
  if (input.strongSignal) reasons.push("Strong signal (minta demo/penawaran/negosiasi)")
  if (aiInterest >= 70) reasons.push("AI: minat beli tinggi")
  if (need >= 70) reasons.push("Kebutuhan jelas")
  if (activity >= 75) reasons.push("Sudah tahap lanjut")
  if (followUp >= 80) reasons.push("Hasil follow up positif")
  if (idleDays >= 5) reasons.push(`Idle ${Math.floor(idleDays)} hari`)

  return {
    score: clamp(score),
    suggestedLevel,
    strongSignal: input.strongSignal,
    components: { aiInterest, need, activity, followUp, recency },
    reasons: reasons.slice(0, 3),
  }
}

/** Hitung ulang saran temperatur & simpan sebagai LeadAiAnalysis type TEMPERATURE_RECOMMENDATION.
 *  Tidak mengubah Lead.temperature (SUGGEST_ONLY). */
export async function recomputeTemperatureSuggestion(leadId: string): Promise<TemperatureSignalResult | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { currentActivityStage: true, outcome: true, lastInteractionAt: true, firstContactAt: true },
  })
  if (!lead || lead.outcome !== "OPEN") return null

  const [profiling, lastCompleted] = await Promise.all([
    prisma.leadAiAnalysis.findFirst({
      where: { leadId, analysisType: "PROFILING", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { outputJson: true },
    }),
    prisma.leadFollowUp.findFirst({
      where: { leadId, status: "COMPLETED", resultTypeId: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { resultType: { select: { code: true, normalizedScore: true } } },
    }),
  ])

  const prof = (profiling?.outputJson ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === "number" ? (v <= 1 ? v * 100 : v) : null)

  const lastCode = lastCompleted?.resultType?.code ?? null
  const strongSignal =
    lead.currentActivityStage === "NEGOTIATION" ||
    lead.currentActivityStage === "PROPOSAL" ||
    lastCode === "REQUEST_PROPOSAL" ||
    lastCode === "REQUEST_DEMO"

  const result = computeTemperatureSignal({
    aiBuyingInterest: num(prof.buyingInterest),
    need: num(prof.need),
    currentActivityStage: lead.currentActivityStage,
    followUpNormalizedScore: lastCompleted?.resultType?.normalizedScore ?? null,
    lastInteractionAt: lead.lastInteractionAt,
    firstContactAt: lead.firstContactAt,
    strongSignal,
  })

  const last = await prisma.leadAiAnalysis.findFirst({
    where: { leadId, analysisType: "TEMPERATURE_RECOMMENDATION" },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  await prisma.leadAiAnalysis.create({
    data: {
      leadId,
      analysisType: "TEMPERATURE_RECOMMENDATION",
      version: (last?.version ?? 0) + 1,
      modelName: "rule",
      promptVersion: TEMPERATURE_RULE_VERSION,
      outputJson: {
        score: result.score,
        suggestedLevel: result.suggestedLevel,
        strongSignal: result.strongSignal,
        reasons: result.reasons,
        components: result.components,
      },
      status: "SUCCESS",
    },
  })

  return result
}
