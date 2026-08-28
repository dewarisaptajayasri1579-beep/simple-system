import { prisma } from "@/lib/prisma"

/** Tunable modul Marketing di `LeadSystemSetting` (key-value JSON). Semua punya default —
 *  UI Settings (Fase 10) hanya meng-override. */
export const MARKETING_SETTING_DEFAULTS = {
  // follow up
  "follow_up.grace_minutes": 15, // docs/06 §37
  "follow_up.reminder_before_minutes": 30,
  "follow_up.overdue_reminder_hours": 24,
  // AI
  "ai.segment_auto_apply_confidence": 0.85, // docs/06 §2.2, §37
  // priority weights (dinormalisasi ke total 1)
  "priority.weight_temperature": 0.25,
  "priority.weight_activity": 0.3,
  "priority.weight_follow_up": 0.25,
  "priority.weight_recency": 0.1,
  "priority.weight_ai": 0.1,
  // escalation ke SPV (docs/06 §18)
  "escalation.hot_unreplied_hours": 2,
  "escalation.followup_overdue_hours": 24,
  "escalation.negotiation_idle_days": 3,
  // temperature (docs/06 §6, §4.1) — automation_mode: 0 = SUGGEST_ONLY, 1 = AUTO_WITH_GUARDRAIL
  "temperature.override_lock_hours": 24,
  "temperature.automation_mode": 0,
  // working hours (docs/06 §33) — Minggu selalu libur, Sen-Jum selalu kerja, Sabtu = toggle
  "working_hours.enabled": 1,
  "working_hours.start_hour": 8,
  "working_hours.end_hour": 17,
  "working_hours.saturday": 1,
} as const

export type MarketingSettingKey = keyof typeof MARKETING_SETTING_DEFAULTS

export async function getMarketingSetting<K extends MarketingSettingKey>(key: K): Promise<number> {
  const row = await prisma.leadSystemSetting.findUnique({ where: { key }, select: { valueJson: true } })
  const raw = row?.valueJson
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
  return Number.isFinite(n) ? n : MARKETING_SETTING_DEFAULTS[key]
}

export async function getAllMarketingSettings() {
  const rows = await prisma.leadSystemSetting.findMany({
    where: { key: { in: Object.keys(MARKETING_SETTING_DEFAULTS) } },
    select: { key: true, valueJson: true },
  })
  const map = new Map(rows.map((r) => [r.key, r.valueJson]))
  const out = {} as Record<MarketingSettingKey, number>
  for (const k of Object.keys(MARKETING_SETTING_DEFAULTS) as MarketingSettingKey[]) {
    const raw = map.get(k)
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
    out[k] = Number.isFinite(n) ? n : MARKETING_SETTING_DEFAULTS[k]
  }
  return out
}

export async function getFollowUpGraceMs() {
  return (await getMarketingSetting("follow_up.grace_minutes")) * 60 * 1000
}

/** Bobot 5 komponen Priority Engine (dari LeadSystemSetting, fallback default). Dinormalisasi
 *  supaya total = 1 walau admin salah isi. */
export async function getPriorityWeights() {
  const [temperature, activity, followUp, recency, ai] = await Promise.all([
    getMarketingSetting("priority.weight_temperature"),
    getMarketingSetting("priority.weight_activity"),
    getMarketingSetting("priority.weight_follow_up"),
    getMarketingSetting("priority.weight_recency"),
    getMarketingSetting("priority.weight_ai"),
  ])
  const raw = { temperature, activity, followUp, recency, ai }
  const sum = temperature + activity + followUp + recency + ai
  if (!(sum > 0)) return { temperature: 0.25, activity: 0.3, followUp: 0.25, recency: 0.1, ai: 0.1 }
  return {
    temperature: raw.temperature / sum,
    activity: raw.activity / sum,
    followUp: raw.followUp / sum,
    recency: raw.recency / sum,
    ai: raw.ai / sum,
  }
}
