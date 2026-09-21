import { NextResponse } from "next/server"

import { generateMetaAdsInsight } from "@/lib/meta-ads/ai-insight"
import { getMetaAdsApiUser } from "@/lib/meta-ads/access"
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

/** POST (bukan GET) karena ini memanggil model berbayar — dibikin eksplisit dipicu tombol
 *  "Analisa dengan AI", bukan ikut jalan tiap halaman dibuka. Semua data ditarik ulang di server
 *  supaya angka yang dianalisa dijamin sama dengan yang dilihat user, bukan kiriman dari client
 *  yang bisa dimanipulasi. */
export async function POST(request: Request) {
  const user = await getMetaAdsApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const rangeParam = searchParams.get("range") ?? "last_30d"
  const range: MetaAdsDatePreset = VALID_PRESETS.has(rangeParam as MetaAdsDatePreset) ? (rangeParam as MetaAdsDatePreset) : "last_30d"

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

    return NextResponse.json(insight)
  } catch (err) {
    const message = err instanceof MetaAdsApiError ? err.message : err instanceof Error ? err.message : "Gagal menganalisa"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
