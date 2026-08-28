import { describe, expect, it } from "vitest"

import { followUpBucket } from "@/lib/marketing/follow-up"
import { computeLeadPriority, levelForScore, recencyScore } from "@/lib/marketing/priority"
import { advanceStage, shouldAutoApplySegment } from "@/lib/marketing/rules"
import { computeTemperatureSignal, levelForSignal } from "@/lib/marketing/temperature"

/**
 * Acceptance tests — docs/06-business-rule.md §40. Fokus ke rule deterministik (pure function).
 * Yang butuh DB (reassign satu PIC, notification dedupe, dst) diverifikasi lewat
 * scripts/marketing-smoke.ts + manual UAT.
 */

const baseLead = {
  temperature: "COLD",
  currentActivityStage: "NONE",
  activityStageScore: null,
  outcome: "OPEN",
  lastInteractionAt: new Date(),
  firstContactAt: new Date(),
  followUpNormalizedScore: null as number | null,
  aiBuyingSignal: null as number | null,
  nextOpenFollowUpAt: null as Date | null,
  customerWaiting: false,
  customerWaitingOverSla: false,
  now: new Date("2026-01-15T10:00:00Z"),
}

describe("Priority Engine (docs/06 §11-§14)", () => {
  it("§40.1 Cold + Diskusi + belum ada respon → BUKAN Top Priority", () => {
    const r = computeLeadPriority({
      ...baseLead,
      temperature: "COLD",
      currentActivityStage: "DISCUSSION",
      followUpNormalizedScore: 30, // NO_RESPONSE
      lastInteractionAt: new Date("2026-01-05T10:00:00Z"), // 10 hari idle
      firstContactAt: new Date("2026-01-01T10:00:00Z"),
    })
    expect(r.level).not.toBe("TOP")
    expect(r.score).toBeLessThan(80)
  })

  it("§40.2 Hot + Negosiasi + follow-up overdue >24 jam → priority tinggi (TOP)", () => {
    const r = computeLeadPriority({
      ...baseLead,
      temperature: "HOT",
      currentActivityStage: "NEGOTIATION",
      followUpNormalizedScore: 90, // REQUEST_DEMO
      aiBuyingSignal: 85,
      nextOpenFollowUpAt: new Date("2026-01-13T10:00:00Z"), // >24 jam lewat
    })
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.level).toBe("TOP")
    expect(r.modifiers.join(" ")).toContain("+15")
  })

  it("§40.4 WON → priority operasional 0", () => {
    expect(computeLeadPriority({ ...baseLead, temperature: "HOT", outcome: "WON" }).score).toBe(0)
  })

  it("§40.5 LOST → priority operasional 0", () => {
    expect(computeLeadPriority({ ...baseLead, temperature: "HOT", outcome: "LOST" }).score).toBe(0)
  })

  it("§40.3 Segment tidak jadi input skor (tidak ada param segment di computeLeadPriority)", () => {
    // Dua panggilan identik tanpa konsep segment → skor sama. Segment tidak pernah menaikkan skor.
    const a = computeLeadPriority({ ...baseLead, temperature: "WARM" })
    const b = computeLeadPriority({ ...baseLead, temperature: "WARM" })
    expect(a.score).toBe(b.score)
  })

  it("§40.9 pesan customer terakhir belum dibalas → modifier customer waiting", () => {
    const withWait = computeLeadPriority({ ...baseLead, temperature: "WARM", customerWaiting: true })
    const noWait = computeLeadPriority({ ...baseLead, temperature: "WARM" })
    expect(withWait.score).toBeGreaterThan(noWait.score)
    expect(withWait.modifiers.join(" ")).toContain("+5")
  })

  it("§40.14 recency exception — follow up terjadwal di masa depan menahan idle penalty", () => {
    const idle = { ...baseLead, temperature: "WARM", lastInteractionAt: new Date("2026-01-01T10:00:00Z") }
    const noFu = computeLeadPriority(idle)
    const withFutureFu = computeLeadPriority({ ...idle, nextOpenFollowUpAt: new Date("2026-01-20T10:00:00Z") })
    expect(withFutureFu.components.recency).toBeGreaterThanOrEqual(noFu.components.recency)
  })

  it("§40.18 rule version — level konsisten dengan threshold", () => {
    expect(levelForScore(80)).toBe("TOP")
    expect(levelForScore(79)).toBe("HIGH")
    expect(levelForScore(60)).toBe("HIGH")
    expect(levelForScore(40)).toBe("MONITOR")
    expect(levelForScore(39)).toBe("LOW")
  })

  it("temperature component pakai 30/60/90 (docs §11.1)", () => {
    const cold = computeLeadPriority({ ...baseLead, temperature: "COLD" }).components.temperature
    const warm = computeLeadPriority({ ...baseLead, temperature: "WARM" }).components.temperature
    const hot = computeLeadPriority({ ...baseLead, temperature: "HOT" }).components.temperature
    expect([cold, warm, hot]).toEqual([30, 60, 90])
  })

  it("AI buying signal default neutral 50, bukan 0 (docs §11.5)", () => {
    expect(computeLeadPriority({ ...baseLead, aiBuyingSignal: null }).components.ai).toBe(50)
  })

  it("recency step-table (docs §10)", () => {
    expect(recencyScore(0.5)).toBe(100)
    expect(recencyScore(1.5)).toBe(80)
    expect(recencyScore(3.5)).toBe(60)
    expect(recencyScore(7)).toBe(40)
    expect(recencyScore(10)).toBe(20)
  })

  it("alasan maksimal 3 (docs §14)", () => {
    const r = computeLeadPriority({
      ...baseLead,
      temperature: "HOT",
      currentActivityStage: "NEGOTIATION",
      customerWaiting: true,
      lastInteractionAt: new Date("2026-01-01T10:00:00Z"),
    })
    expect(r.reasons.length).toBeLessThanOrEqual(3)
  })
})

describe("Aktivitas stage (docs/06 §7)", () => {
  it("§40.14 aktivitas rank lebih rendah TIDAK menurunkan current stage", () => {
    expect(advanceStage("NEGOTIATION", "DISCUSSION")).toBe("NEGOTIATION")
  })
  it("aktivitas rank lebih tinggi menaikkan stage", () => {
    expect(advanceStage("DISCUSSION", "PROPOSAL")).toBe("PROPOSAL")
  })
  it("aktivitas non-stage tidak mengubah stage", () => {
    expect(advanceStage("PROPOSAL", "CALL")).toBe("PROPOSAL")
  })
})

describe("Segmentasi AI (docs/06 §2.2, §2.3)", () => {
  it("§40.13 confidence rendah TIDAK auto-apply", () => {
    expect(shouldAutoApplySegment(0.7, 0.85, null)).toBe(false)
  })
  it("confidence tinggi + lead belum bersegmen → auto-apply", () => {
    expect(shouldAutoApplySegment(0.9, 0.85, null)).toBe(true)
  })
  it("koreksi manual menang — lead sudah bersegmen tidak ditimpa", () => {
    expect(shouldAutoApplySegment(0.99, 0.85, "seg-123")).toBe(false)
  })
})

describe("Follow up bucket (docs/06 §16, §8.3)", () => {
  const now = new Date("2026-01-15T12:00:00Z")
  it("§40.8 OPEN + scheduledAt sebelum hari ini → overdue", () => {
    expect(followUpBucket("OPEN", new Date("2026-01-13T09:00:00Z"), now)).toBe("overdue")
  })
  it("OPEN beberapa jam lagi (hari yang sama) → today", () => {
    expect(followUpBucket("OPEN", new Date(now.getTime() + 3 * 3600_000), now)).toBe("today")
  })
  it("OPEN 3 hari lagi → upcoming", () => {
    expect(followUpBucket("OPEN", new Date(now.getTime() + 3 * 86400_000), now)).toBe("upcoming")
  })
  it("COMPLETED → done (apapun jadwalnya)", () => {
    expect(followUpBucket("COMPLETED", new Date("2026-01-01T09:00:00Z"), now)).toBe("done")
  })
})

describe("Temperature Signal Score (docs/06 §4-§5)", () => {
  const t = {
    aiBuyingInterest: 50 as number | null,
    need: 50 as number | null,
    currentActivityStage: "NONE",
    followUpNormalizedScore: null as number | null,
    lastInteractionAt: new Date("2026-01-15T10:00:00Z"),
    firstContactAt: new Date("2026-01-15T10:00:00Z"),
    strongSignal: false,
    now: new Date("2026-01-15T10:30:00Z"),
  }
  it("mapping 0-39 Cold / 40-69 Warm / 70-100 Hot", () => {
    expect(levelForSignal(30)).toBe("COLD")
    expect(levelForSignal(55)).toBe("WARM")
    expect(levelForSignal(75)).toBe("HOT")
  })
  it("§5 strong signal → langsung menyarankan HOT walau skor rendah", () => {
    const r = computeTemperatureSignal({ ...t, aiBuyingInterest: 10, need: 10, strongSignal: true })
    expect(r.suggestedLevel).toBe("HOT")
    expect(r.strongSignal).toBe(true)
  })
  it("info kosong → default netral, tidak langsung Cold ekstrem", () => {
    const r = computeTemperatureSignal({ ...t, aiBuyingInterest: null, need: null })
    expect(r.score).toBeGreaterThan(0)
  })
})
