/** Aturan deterministik kecil modul Marketing — pure function, tanpa dependency, mudah dites. */

/** Rank tahap (docs/06 §7). NONE < DISCUSSION < ZOOM_DEMO < PROPOSAL < NEGOTIATION. */
export const STAGE_RANK: Record<string, number> = {
  NONE: 0,
  DISCUSSION: 1,
  ZOOM_DEMO: 2,
  PROPOSAL: 3,
  NEGOTIATION: 4,
}

/**
 * Tahap baru setelah aktivitas dengan kode `activityCode` dicatat.
 * Stage hanya NAIK (docs/06 §7.1, §7.2) — aktivitas rank lebih rendah tidak menurunkan stage.
 * Aktivitas non-stage (CALL, OFFLINE_MEETING, dst) tidak mengubah stage.
 */
export function advanceStage(current: string, activityCode: string): string {
  const cur = STAGE_RANK[current] ?? 0
  const next = STAGE_RANK[activityCode]
  if (next == null) return current
  return next > cur ? activityCode : current
}

/** Segmentasi AI boleh auto-apply kalau confidence >= threshold DAN lead belum bersegmen
 *  (docs/06 §2.2, §2.3 — koreksi manual selalu menang). */
export function shouldAutoApplySegment(
  confidence: number | null | undefined,
  threshold: number,
  currentSegmentId: string | null | undefined,
): boolean {
  if (currentSegmentId) return false
  return typeof confidence === "number" && confidence >= threshold
}
