import { NextResponse } from "next/server"

import { generateMetaAdsInsight, type MetaAdsFinding } from "@/lib/meta-ads/ai-insight"
import { getMetaAdsApiUser } from "@/lib/meta-ads/access"
import { prisma } from "@/lib/prisma"
import {
  fetchAccountSummary,
  fetchBreakdownInsights,
  fetchCampaignInsights,
  fetchDailyTrend,
  getActiveMetaAdsAccount,
  MetaAdsApiError,
  type MetaAdsBreakdownDimension,
  type MetaAdsDatePreset,
} from "@/lib/meta-ads/client"

const VALID_PRESETS = new Set<MetaAdsDatePreset>(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"])
const RANGE_LABEL: Record<MetaAdsDatePreset, string> = {
  today: "Hari ini",
  yesterday: "Kemarin",
  last_7d: "7 hari terakhir",
  last_14d: "14 hari terakhir",
  last_30d: "30 hari terakhir",
  this_month: "Bulan ini",
  last_month: "Bulan lalu",
}
const DIMENSIONS: MetaAdsBreakdownDimension[] = ["age", "gender", "region", "placement"]

function resolveRange(request: Request): MetaAdsDatePreset {
  const raw = new URL(request.url).searchParams.get("range") ?? "last_30d"
  return VALID_PRESETS.has(raw as MetaAdsDatePreset) ? (raw as MetaAdsDatePreset) : "last_30d"
}

/** GET — ambil hasil analisa TERSIMPAN terakhir untuk rentang ini (tidak memanggil model sama
 *  sekali, jadi gratis & instan). Dipakai saat halaman dibuka supaya kesimpulan yang sudah pernah
 *  dibuat tidak hilang cuma karena refresh. */
export async function GET(request: Request) {
  const user = await getMetaAdsApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  const range = resolveRange(request)
  const account = await getActiveMetaAdsAccount()
  if (!account) return NextResponse.json(null)

  // Hasil terakhir + total biaya bulan berjalan diambil sekaligus (aggregate di database, bukan
  // tarik semua baris lalu dijumlah di JS) supaya tetap murah walau riwayatnya sudah ratusan.
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [run, monthly] = await Promise.all([
    prisma.metaAdsInsightRun.findFirst({
      where: { accountId: account.id, range },
      orderBy: { createdAt: "desc" },
      select: { id: true, headline: true, findings: true, caveat: true, createdAt: true, costIdr: true },
    }),
    prisma.metaAdsInsightRun.aggregate({
      where: { accountId: account.id, createdAt: { gte: startOfMonth } },
      _sum: { costIdr: true },
      _count: true,
    }),
  ])
  if (!run) return NextResponse.json(null)

  return NextResponse.json({
    id: run.id,
    headline: run.headline,
    findings: run.findings as unknown as MetaAdsFinding[],
    caveat: run.caveat,
    createdAt: run.createdAt,
    costIdr: run.costIdr,
    monthlyCostIdr: monthly._sum.costIdr ?? 0,
    monthlyRuns: monthly._count,
  })
}

/** POST (bukan GET) karena ini memanggil model berbayar — dibikin eksplisit dipicu tombol
 *  "Analisa dengan AI", bukan ikut jalan tiap halaman dibuka. Semua data ditarik ulang di server
 *  supaya angka yang dianalisa dijamin sama dengan yang dilihat user, bukan kiriman dari client
 *  yang bisa dimanipulasi. */
export async function POST(request: Request) {
  const user = await getMetaAdsApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  const range = resolveRange(request)
  const account = await getActiveMetaAdsAccount()
  if (!account) return NextResponse.json({ error: "Belum ada akun Meta Ads yang dikonek" }, { status: 404 })

  try {
    const [summary, campaigns, trend, ...breakdownResults] = await Promise.all([
      fetchAccountSummary(account.adAccountId, account.accessToken, range),
      fetchCampaignInsights(account.adAccountId, account.accessToken, range),
      fetchDailyTrend(account.adAccountId, account.accessToken, range),
      ...DIMENSIONS.map((dim) => fetchBreakdownInsights(account.adAccountId, account.accessToken, range, dim)),
    ])

    const breakdowns = Object.fromEntries(DIMENSIONS.map((dim, i) => [dim, breakdownResults[i]]))

    const insight = await generateMetaAdsInsight({
      currency: summary.currency,
      rangeLabel: RANGE_LABEL[range],
      summary,
      campaigns,
      trend,
      breakdowns,
    })

    const saved = await prisma.metaAdsInsightRun.create({
      data: {
        accountId: account.id,
        range,
        headline: insight.headline,
        findings: insight.findings as unknown as object,
        caveat: insight.caveat,
        snapshot: {
          spend: summary.totalSpend,
          impressions: summary.totalImpressions,
          reach: summary.totalReach,
          clicks: summary.totalClicks,
          currency: summary.currency,
        },
        inputTokens: insight.usage.inputTokens,
        outputTokens: insight.usage.outputTokens,
        costIdr: insight.usage.costIdr,
        createdById: user.id,
      },
      select: { id: true, createdAt: true },
    })

    return NextResponse.json({ ...insight, id: saved.id, createdAt: saved.createdAt })
  } catch (err) {
    const message = err instanceof MetaAdsApiError ? err.message : err instanceof Error ? err.message : "Gagal menganalisa"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
