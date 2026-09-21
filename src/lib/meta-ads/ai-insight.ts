import Anthropic from "@anthropic-ai/sdk"

import type { MetaAdsAccountSummary, MetaAdsBreakdownRow, MetaAdsDailyPoint, MetaCampaignInsight } from "@/lib/meta-ads/client"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Opus dipakai (bukan Haiku seperti agent WhatsApp di lib/agent.ts) karena ini bukan tugas
 *  menjalankan tool, tapi menarik kesimpulan dari angka: bandingkan segmen, tandai sample yang
 *  terlalu kecil buat dipercaya, dan hitung potensi hemat. Thinking aktif default di Opus 5, jadi
 *  max_tokens perlu longgar — dia menghitung dulu sebelum menjawab. */
const MODEL = "claude-opus-5"
const MAX_TOKENS = 16000

export type MetaAdsFindingSeverity = "good" | "info" | "warning" | "critical"

export type MetaAdsFinding = {
  title: string
  severity: MetaAdsFindingSeverity
  detail: string
  action: string
}

export type MetaAdsAiInsight = {
  headline: string
  findings: MetaAdsFinding[]
  caveat: string
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "findings", "caveat"],
  properties: {
    headline: { type: "string", description: "Satu kalimat ringkas kondisi iklan periode ini." },
    findings: {
      type: "array",
      description: "3-6 kesimpulan, diurutkan dari yang paling berdampak ke bisnis.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "detail", "action"],
        properties: {
          title: { type: "string", description: "Judul singkat temuan, maksimal 60 karakter." },
          severity: {
            type: "string",
            enum: ["good", "info", "warning", "critical"],
            description: "good = kabar bagus, info = netral, warning = perlu perhatian, critical = rugi/boros nyata.",
          },
          detail: { type: "string", description: "Penjelasan 1-3 kalimat DENGAN angka konkret dari data." },
          action: { type: "string", description: "Satu langkah konkret yang bisa dilakukan user." },
        },
      },
    },
    caveat: { type: "string", description: "Satu kalimat: keterbatasan data ini (sample kecil, klik != closing, dsb)." },
  },
} as const

const SYSTEM_PROMPT = `Kamu analis Meta Ads yang membantu pemilik usaha kecil di Indonesia membaca performa iklannya.

Tugasmu: baca angka yang diberikan, lalu tarik kesimpulan yang BISA DITINDAKLANJUTI. Bukan mengulang angka, tapi menjelaskan artinya.

Cara menganalisa:
1. Silangkan CTR dengan CPC dan spend — CTR tinggi tapi spend-nya kecil sekali (di bawah ~50 klik) BELUM bisa dipercaya, sebut itu apa adanya, jangan jadikan rekomendasi utama.
2. Cari ketimpangan alokasi: segmen/penempatan yang menyerap budget besar tapi CPC-nya jauh lebih mahal dari yang terbaik. Hitung perkiraan klik tambahan kalau budget digeser (spend boros ÷ CPC terbaik − klik yang didapat sekarang).
3. Cari campaign bagus yang justru PAUSED, dan campaign boros yang masih ACTIVE.
4. Cek tren harian: apakah iklan berhenti (tidak ada data di hari-hari terakhir), dan apakah CTR turun saat spend naik (tanda audiens jenuh / materi iklan basi).
5. Frekuensi = impressions ÷ reach. Di atas 4 berarti audiens mulai bosan.

Aturan menulis:
- Bahasa Indonesia santai tapi profesional, seperti menjelaskan ke teman yang bukan orang marketing.
- SELALU sertakan angka konkret di setiap temuan. Jangan bilang "CPC-nya mahal" — sebut berapa dan dibanding apa.
- Nominal uang pakai format Rupiah (mis. Rp1.808.150).
- Jangan mengarang angka yang tidak ada di data. Kalau data tidak cukup untuk suatu kesimpulan, jangan buat kesimpulan itu.
- Jangan pernah mengklaim sesuatu soal penjualan/closing — data ini cuma sampai klik.`

type BuildInput = {
  currency: string
  rangeLabel: string
  summary: MetaAdsAccountSummary
  campaigns: MetaCampaignInsight[]
  trend: MetaAdsDailyPoint[]
  breakdowns: Record<string, MetaAdsBreakdownRow[]>
}

/** Ringkas data jadi payload kecil sebelum dikirim ke model — breakdown dipotong 8 baris teratas
 *  per dimensi dan tren cuma dikirim angka hariannya, supaya prompt tetap murah walau akunnya
 *  punya puluhan campaign & 35 wilayah. */
function buildPayload({ currency, rangeLabel, summary, campaigns, trend, breakdowns }: BuildInput) {
  const round = (n: number) => Math.round(n)
  return {
    mata_uang: currency,
    rentang: rangeLabel,
    ringkasan: {
      spend: round(summary.totalSpend),
      impressions: summary.totalImpressions,
      reach: summary.totalReach,
      clicks: summary.totalClicks,
      frekuensi: summary.totalReach > 0 ? +(summary.totalImpressions / summary.totalReach).toFixed(2) : null,
      ctr_rata2: summary.totalImpressions > 0 ? +((summary.totalClicks / summary.totalImpressions) * 100).toFixed(2) : null,
      cpc_rata2: summary.totalClicks > 0 ? round(summary.totalSpend / summary.totalClicks) : null,
    },
    campaign: campaigns.slice(0, 15).map((c) => ({
      nama: c.campaignName,
      status: c.status,
      spend: round(c.spend),
      clicks: c.clicks,
      ctr: +c.ctr.toFixed(2),
      cpc: round(c.cpc),
    })),
    tren_harian: trend.map((p) => ({ tanggal: p.date, spend: round(p.spend), clicks: p.clicks, ctr: +p.ctr.toFixed(2) })),
    segmen: Object.fromEntries(
      Object.entries(breakdowns).map(([dim, rows]) => [
        dim,
        rows.slice(0, 8).map((r) => ({ label: r.label, spend: round(r.spend), clicks: r.clicks, ctr: +r.ctr.toFixed(2), cpc: round(r.cpc) })),
      ])
    ),
  }
}

export async function generateMetaAdsInsight(input: BuildInput): Promise<MetaAdsAiInsight> {
  const payload = buildPayload(input)

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: `Berikut data performa Meta Ads. Analisa dan beri kesimpulan.\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  })

  if (response.stop_reason === "refusal") throw new Error("Analisa ditolak oleh filter keamanan model")

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")

  if (!text.trim()) throw new Error("Model tidak mengembalikan hasil analisa")

  return JSON.parse(text) as MetaAdsAiInsight
}
