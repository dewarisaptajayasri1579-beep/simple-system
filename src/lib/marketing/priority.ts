import { prisma } from "@/lib/prisma"
import { getMarketingSetting, getPriorityWeights } from "@/lib/marketing/settings"

/**
 * Priority Engine — implementasi `docs/06-business-rule.md` §7-§14, §36-§38.
 *
 * Base = TemperatureComp*wT + ActivityComp*wA + FollowUpComp*wF + RecencyComp*wR + AIBuyingSignal*wAI
 * lalu + modifier (follow-up due, customer waiting), clamp 0-100. Lead non-OPEN → 0.
 *
 * `recalcLeadPriority` dipanggil di tiap event penting (docs/06 §15). Menyimpan `Lead.priorityScore`
 * / `priorityLevel` + 1 baris `LeadPrioritySnapshot` (breakdown + alasan + ruleVersion).
 */
export const PRIORITY_RULE_VERSION = "priority-v1"

const DEFAULT_W = { temperature: 0.25, activity: 0.3, followUp: 0.25, recency: 0.1, ai: 0.1 }
export type PriorityWeights = typeof DEFAULT_W

// §11.1
const TEMP_COMPONENT: Record<string, number> = { COLD: 30, WARM: 60, HOT: 90 }
// §7 normalized (fallback bila LeadActivityType.score tidak tersedia)
const STAGE_COMPONENT: Record<string, number> = { NONE: 0, DISCUSSION: 20, ZOOM_DEMO: 55, PROPOSAL: 75, NEGOTIATION: 90 }
const STAGE_LABEL: Record<string, string> = {
  DISCUSSION: "Diskusi",
  ZOOM_DEMO: "Zoom/Demo",
  PROPOSAL: "Sudah Penawaran",
  NEGOTIATION: "Negosiasi",
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n))
}

export function levelForScore(score: number): "LOW" | "MONITOR" | "HIGH" | "TOP" {
  if (score >= 80) return "TOP"
  if (score >= 60) return "HIGH"
  if (score >= 40) return "MONITOR"
  return "LOW"
}

/** §10 Recency Score — step table by idle days. */
export function recencyScore(idleDays: number): number {
  if (idleDays < 1) return 100
  if (idleDays < 3) return 80
  if (idleDays < 5) return 60
  if (idleDays <= 7) return 40
  return 20
}

interface PriorityInput {
  temperature: string
  currentActivityStage: string
  activityStageScore?: number | null // LeadActivityType.score untuk stage sekarang (kalau ada)
  outcome: string
  lastInteractionAt: Date | null
  firstContactAt: Date
  followUpNormalizedScore: number | null // LeadFollowUpResultType.normalizedScore dari FU selesai terakhir
  aiBuyingSignal: number | null // 0..100
  buyingPowerEffect?: number | null // LeadBuyingPowerTier.priorityScoreEffect (modifier flat, opsional)
  nextOpenFollowUpAt: Date | null
  customerWaiting: boolean // pesan terakhir INBOUND & belum dibalas
  customerWaitingOverSla: boolean
  now?: Date
}

export interface PriorityResult {
  score: number
  level: "LOW" | "MONITOR" | "HIGH" | "TOP"
  components: { temperature: number; activity: number; followUp: number; recency: number; ai: number }
  modifiers: string[]
  reasons: string[]
}

export function computeLeadPriority(input: PriorityInput, weights: PriorityWeights = DEFAULT_W): PriorityResult {
  const now = input.now ?? new Date()

  // §12.3 — WON/LOST → priority operasional 0
  if (input.outcome !== "OPEN") {
    return {
      score: 0,
      level: "LOW",
      components: { temperature: 0, activity: 0, followUp: 0, recency: 0, ai: 0 },
      modifiers: [],
      reasons: [input.outcome === "WON" ? "Sudah WON" : "Sudah LOST"],
    }
  }

  const temperature = TEMP_COMPONENT[input.temperature] ?? 30
  const activity = input.activityStageScore ?? STAGE_COMPONENT[input.currentActivityStage] ?? 0
  const followUp = input.followUpNormalizedScore == null ? 50 : clamp(input.followUpNormalizedScore) // §11.3

  const ref = input.lastInteractionAt ?? input.firstContactAt
  const idleDays = Math.max(0, (now.getTime() - ref.getTime()) / 86400000)
  let recency = recencyScore(idleDays)
  // §10 exception — ada follow up terjadwal di masa depan → tahan idle penalty
  if (input.nextOpenFollowUpAt && input.nextOpenFollowUpAt.getTime() > now.getTime()) {
    recency = Math.max(recency, 80)
  }

  const ai = input.aiBuyingSignal == null ? 50 : clamp(input.aiBuyingSignal) // §11.5 neutral 50

  const W = weights
  const base =
    temperature * W.temperature + activity * W.activity + followUp * W.followUp + recency * W.recency + ai * W.ai

  // §12 modifiers
  let mod = 0
  const modifiers: string[] = []
  if (input.nextOpenFollowUpAt) {
    const hrsToDue = (input.nextOpenFollowUpAt.getTime() - now.getTime()) / 3600000
    if (hrsToDue < -24) {
      mod += 15
      modifiers.push("Follow up telat >24 jam (+15)")
    } else if (hrsToDue < 0) {
      mod += 10
      modifiers.push("Follow up terlambat (+10)")
    } else if (hrsToDue <= 2) {
      mod += 5
      modifiers.push("Follow up jatuh tempo ≤2 jam (+5)")
    }
  }
  if (input.customerWaiting) {
    if (input.customerWaitingOverSla) {
      mod += 10
      modifiers.push("Customer menunggu > SLA (+10)")
    } else {
      mod += 5
      modifiers.push("Customer menunggu dibalas (+5)")
    }
  }
  // Kemampuan beli — modifier flat dari LeadBuyingPowerTier.priorityScoreEffect (bisa +/-, 0 = netral).
  if (input.buyingPowerEffect) {
    const e = Math.round(input.buyingPowerEffect)
    mod += e
    modifiers.push(`Kemampuan beli (${e > 0 ? "+" : ""}${e})`)
  }

  const score = clamp(Math.round(base + mod)) // §12.4

  // §14 — alasan maksimal 3
  const reasons: string[] = []
  if (input.temperature === "HOT") reasons.push("Hot")
  else if (input.temperature === "WARM") reasons.push("Warm")
  if (input.currentActivityStage !== "NONE" && STAGE_LABEL[input.currentActivityStage]) {
    reasons.push(STAGE_LABEL[input.currentActivityStage])
  }
  if (input.nextOpenFollowUpAt && input.nextOpenFollowUpAt.getTime() < now.getTime()) reasons.push("Follow Up Terlambat")
  else if (input.customerWaiting) reasons.push("Chat Belum Dibalas")
  else if (idleDays >= 5) reasons.push(`Idle ${Math.floor(idleDays)} hari`)

  const finalReasons = reasons.slice(0, 3)
  if (finalReasons.length === 0) finalReasons.push("Pantau")

  return {
    score,
    level: levelForScore(score),
    components: { temperature, activity, followUp, recency, ai },
    modifiers,
    reasons: finalReasons,
  }
}

function weightsAreDefault(w: PriorityWeights) {
  return (["temperature", "activity", "followUp", "recency", "ai"] as const).every(
    (k) => Math.abs(w[k] - DEFAULT_W[k]) < 1e-6,
  )
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
      buyingPowerTier: { select: { priorityScoreEffect: true } },
    },
  })
  if (!lead) return null

  const [stageType, lastCompleted, aiAnalysis, nextFu, latestMsg, weights, hotSlaHours] = await Promise.all([
    lead.currentActivityStage === "NONE"
      ? Promise.resolve(null)
      : prisma.leadActivityType.findUnique({ where: { code: lead.currentActivityStage }, select: { score: true } }),
    prisma.leadFollowUp.findFirst({
      where: { leadId, status: "COMPLETED", resultTypeId: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { resultType: { select: { normalizedScore: true } } },
    }),
    prisma.leadAiAnalysis.findFirst({
      where: { leadId, analysisType: "BUYING_SIGNAL", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { outputJson: true },
    }),
    prisma.leadFollowUp.findFirst({
      where: { leadId, status: "OPEN" },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    }),
    prisma.message.findFirst({
      where: { conversation: { leadId } },
      orderBy: { sentAt: "desc" },
      select: { direction: true, sentAt: true },
    }),
    getPriorityWeights(),
    getMarketingSetting("escalation.hot_unreplied_hours"),
  ])

  let aiBuyingSignal: number | null = null
  if (aiAnalysis?.outputJson && typeof aiAnalysis.outputJson === "object") {
    const raw = (aiAnalysis.outputJson as Record<string, unknown>).score
    if (typeof raw === "number") aiBuyingSignal = raw <= 1 ? raw * 100 : raw
  }

  const customerWaiting = latestMsg?.direction === "INBOUND"
  const customerWaitingOverSla =
    customerWaiting && Date.now() - latestMsg!.sentAt.getTime() > hotSlaHours * 3600000

  const result = computeLeadPriority(
    {
      temperature: lead.temperature,
      currentActivityStage: lead.currentActivityStage,
      activityStageScore: stageType?.score ?? null,
      outcome: lead.outcome,
      lastInteractionAt: lead.lastInteractionAt,
      firstContactAt: lead.firstContactAt,
      followUpNormalizedScore: lastCompleted?.resultType?.normalizedScore ?? null,
      aiBuyingSignal,
      buyingPowerEffect: lead.buyingPowerTier?.priorityScoreEffect ?? null,
      nextOpenFollowUpAt: nextFu?.scheduledAt ?? null,
      customerWaiting,
      customerWaitingOverSla,
    },
    weights,
  )

  const ruleVersion = weightsAreDefault(weights) ? PRIORITY_RULE_VERSION : `${PRIORITY_RULE_VERSION}-custom`

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
        reasonJson: { reasons: result.reasons, modifiers: result.modifiers },
        ruleVersion,
      },
    }),
  ])

  return result
}
