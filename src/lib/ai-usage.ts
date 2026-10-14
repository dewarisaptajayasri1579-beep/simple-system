import { prisma } from "@/lib/prisma"

/**
 * Pencatatan biaya pemakaian AI.
 *
 * Tujuannya satu: biaya fitur AI bisa dilihat per fitur, bukan cuma muncul sebagai satu angka
 * di tagihan Anthropic akhir bulan. Tanpa ini tidak ada dasar untuk memutuskan hal seperti
 * "perlu pindah ke model yang lebih murah atau belum".
 */

/** Tarif per 1 juta token (USD) — sumber: platform.claude.com/docs pricing.
 *  Kalau tarif berubah atau modelnya diganti, ubah di sini saja. Angka historis tidak ikut
 *  berubah karena biaya disnapshot dalam Rupiah saat dicatat. */
const RATES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },
}
const DEFAULT_RATE = RATES["claude-sonnet-5"]

/** Cache read ~0.1x harga input, cache write (TTL 5 menit) 1.25x. */
const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_MULTIPLIER = 1.25

/** Kurs untuk menampilkan biaya ke user. SENGAJA hardcode, sama alasannya dengan
 *  meta-ads/ai-insight.ts: angkanya buat ancar-ancar "sekali pakai habis berapa", bukan buat
 *  pembukuan — tagihan aslinya tetap USD dari Anthropic. */
const IDR_PER_USD = 16_500

export type AiFeature = "kalkulator-harga" | "form-pekerjaan" | "blesscom-pengajuan"

export type AiUsageInput = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function computeCostIdr(model: string, usage: AiUsageInput): number {
  const rate = RATES[model] ?? DEFAULT_RATE
  const usd =
    (usage.input_tokens / 1_000_000) * rate.input +
    (usage.output_tokens / 1_000_000) * rate.output +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * rate.input * CACHE_READ_MULTIPLIER +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * rate.input * CACHE_WRITE_MULTIPLIER
  return Math.ceil(usd * IDR_PER_USD)
}

/**
 * Catat sekali pemakaian AI. SENGAJA tidak pernah melempar error — gagal mencatat biaya tidak
 * boleh menggagalkan permintaan user yang sudah terlanjur diproses dan dibayar.
 */
export async function recordAiUsage(params: {
  feature: AiFeature
  model: string
  usage: AiUsageInput
  userId?: string | null
}): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        feature: params.feature,
        model: params.model,
        inputTokens: params.usage.input_tokens,
        outputTokens: params.usage.output_tokens,
        cacheReadTokens: params.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: params.usage.cache_creation_input_tokens ?? 0,
        costIdr: computeCostIdr(params.model, params.usage),
        createdById: params.userId ?? null,
      },
    })
  } catch (e) {
    console.error("[ai-usage] gagal mencatat pemakaian AI:", e)
  }
}

export type AiUsageSummary = {
  feature: string
  calls: number
  costIdr: number
}

/** Ringkasan biaya sejak tanggal tertentu, dikelompokkan per fitur. */
export async function summarizeAiUsage(since: Date): Promise<{ total: number; calls: number; perFeature: AiUsageSummary[] }> {
  const grouped = await prisma.aiUsageLog.groupBy({
    by: ["feature"],
    where: { createdAt: { gte: since } },
    _sum: { costIdr: true },
    _count: { _all: true },
  })

  const perFeature = grouped
    .map((g) => ({ feature: g.feature, calls: g._count._all, costIdr: g._sum.costIdr ?? 0 }))
    .sort((a, b) => b.costIdr - a.costIdr)

  return {
    total: perFeature.reduce((sum, f) => sum + f.costIdr, 0),
    calls: perFeature.reduce((sum, f) => sum + f.calls, 0),
    perFeature,
  }
}
