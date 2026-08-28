import { prisma } from "@/lib/prisma"
import { getPriorityWeights } from "@/lib/marketing/settings"

/**
 * Priority Engine — skor 0–100 deterministik. Bobot default (docs/06-business-rule.md):
 *   Temperatur 25% · Aktivitas/Tahap 30% · Hasil Follow Up 25% · Recency/Idle 10% · AI Signal 10%
 * Bobot bisa di-override di /marketing/settings (dinormalisasi ke total 1).
 *
 * `recalcLeadPriority` dipanggil di tiap event penting (pesan masuk/keluar, ubah temperatur,
 * aktivitas baru, follow up selesai, ubah outcome). Menyimpan nilai terbaru di `Lead.priorityScore`
 * / `priorityLevel` + 1 baris `LeadPrioritySnapshot` (breakdown + alasan).
 */
export const PRIORITY_RULE_VERSION = "v1"

const DEFAULT_W = { temperature: 0.25, activity: 0.3, followUp: 0.25, recency: 0.1, ai: 0.1 }
export type PriorityWeights = typeof DEFAULT_W

const TEMP_SCORE: Record<string, number> = { COLD: 0, WARM: 50, HOT: 100 }
const STAGE_SCORE: Record<string, number> = { NONE: 0, DISCUSSION: 30, ZOOM_DEMO: 55, PROPOSAL: 80, NEGOTIATION: 100 }

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n))
}

export function levelForScore(score: number): "LOW" | "MONITOR" | "HIGH" | "TOP" {
  if (score >= 80) return "TOP"
  if (score >= 60) return "HIGH"
  if (score >= 40) return "MONITOR"
  return "LOW"
}

interface PriorityInput {
  temperature: string
  currentActivityStage: string
  outcome: string
  lastInteractionAt: Date | null
  firstContactAt: Date
  lastCompletedResultEffect: number | null // LeadFollowUpResultType.priorityScoreEffect (-25..+20)
  aiBuyingSignal: number | null // 0..100
  now?: Date
}

export interface PriorityResult {
  score: number
  level: "LOW" | "MONITOR" | "HIGH" | "TOP"
  components: { temperature: number; activity: number; followUp: number; recency: number; ai: number }
  reasons: string[]
}

export function computeLeadPriority(input: PriorityInput, weights: PriorityWeights = DEFAULT_W): PriorityResult {
  const W = weights
  // Lead yang sudah WON/LOST tidak perlu diprioritaskan lagi.
  if (input.outcome !== "OPEN") {
    return {
      score: 0,
      level: "LOW",
      components: { temperature: 0, activity: 0, followUp: 0, recency: 0, ai: 0 },
      reasons: [input.outcome === "WON" ? "Sudah WON" : "Sudah LOST"],
    }
  }

  const now = input.now ?? new Date()
  const temperature = TEMP_SCORE[input.temperature] ?? 0
  const activity = STAGE_SCORE[input.currentActivityStage] ?? 0
  const followUp = input.lastCompletedResultEffect == null ? 40 : clamp(50 + input.lastCompletedResultEffect * 2)

  const ref = input.lastInteractionAt ?? input.firstContactAt
  const idleDays = Math.max(0, (now.getTime() - ref.getTime()) / 86400000)
  const recency = clamp(100 - idleDays * 7)

  const ai = input.aiBuyingSignal == null ? 0 : clamp(input.aiBuyingSignal)

  const score = Math.round(
    temperature * W.temperature + activity * W.activity + followUp * W.followUp + recency * W.recency + ai * W.ai,
  )

  const reasons: string[] = []
  if (input.temperature === "HOT") reasons.push("Hot")
  else if (input.temperature === "WARM") reasons.push("Warm")
  if (input.currentActivityStage !== "NONE") {
    reasons.push(
      { DISCUSSION: "Diskusi", ZOOM_DEMO: "Zoom/Demo", PROPOSAL: "Penawaran", NEGOTIATION: "Negosiasi" }[
        input.currentActivityStage
      ] ?? input.currentActivityStage,
    )
  }
  if (input.lastCompletedResultEffect != null && input.lastCompletedResultEffect >= 15) reasons.push("Sinyal beli kuat")
  if (input.lastCompletedResultEffect != null && input.lastCompletedResultEffect <= -20) reasons.push("Respon negatif")
  if (idleDays >= 5) reasons.push(`Idle ${Math.floor(idleDays)} hari`)
  if (ai >= 60) reasons.push("AI: buying signal tinggi")

  return {
    score: clamp(score),
    level: levelForScore(score),
    components: { temperature, activity, followUp, recency, ai },
    reasons: reasons.length ? reasons : ["Pantau"],
  }
}

export async function recalcLeadPriority(leadId: string): Promise<PriorityResult | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      temperature: true,
      currentActivityStage: true,
      outcome: true,
      lastInteractionAt: true,
      firstContactAt: true,
    },
  })
  if (!lead) return null

  const [lastCompleted, aiAnalysis] = await Promise.all([
    prisma.leadFollowUp.findFirst({
      where: { leadId, status: "COMPLETED", resultTypeId: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { resultType: { select: { priorityScoreEffect: true } } },
    }),
    prisma.leadAiAnalysis.findFirst({
      where: { leadId, analysisType: "BUYING_SIGNAL", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { outputJson: true, confidence: true },
    }),
  ])

  let aiBuyingSignal: number | null = null
  if (aiAnalysis?.outputJson && typeof aiAnalysis.outputJson === "object") {
    const raw = (aiAnalysis.outputJson as Record<string, unknown>).score ?? (aiAnalysis.outputJson as Record<string, unknown>).buyingSignal
    if (typeof raw === "number") aiBuyingSignal = raw <= 1 ? raw * 100 : raw
  }

  const weights = await getPriorityWeights()
  const result = computeLeadPriority(
    {
      temperature: lead.temperature,
      currentActivityStage: lead.currentActivityStage,
      outcome: lead.outcome,
      lastInteractionAt: lead.lastInteractionAt,
      firstContactAt: lead.firstContactAt,
      lastCompletedResultEffect: lastCompleted?.resultType?.priorityScoreEffect ?? null,
      aiBuyingSignal,
    },
    weights,
  )

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { priorityScore: result.score, priorityLevel: result.level } }),
    prisma.leadPrioritySnapshot.create({
      data: {
        leadId,
        score: result.score,
        level: result.level,
        componentTemperature: result.components.temperature,
        componentActivity: result.components.activity,
        componentFollowUp: result.components.followUp,
        componentRecency: result.components.recency,
        componentAi: result.components.ai,
        reasonJson: result.reasons,
        ruleVersion: PRIORITY_RULE_VERSION,
      },
    }),
  ])

  return result
}
