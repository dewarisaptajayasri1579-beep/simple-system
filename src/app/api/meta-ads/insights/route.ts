import { NextResponse } from "next/server"

import { getMetaAdsApiUser } from "@/lib/meta-ads/access"
import {
  fetchBreakdownInsights,
  fetchDailyTrend,
  getActiveMetaAdsAccount,
  MetaAdsApiError,
  recordSyncResult,
  type MetaAdsBreakdownDimension,
  type MetaAdsDatePreset,
} from "@/lib/meta-ads/client"

const VALID_PRESETS = new Set<MetaAdsDatePreset>(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"])
const VALID_DIMENSIONS = new Set<MetaAdsBreakdownDimension>(["age", "gender", "region", "placement"])

/** GET /api/meta-ads/insights?range=last_30d&dimension=age — tren harian akun + breakdown
 *  performa per segmen audiens ("Target Market"). Dipisah dari /api/meta-ads/campaigns karena
 *  beda tingkat agregasi (akun, bukan per-campaign) dan dipanggil ulang tiap ganti dimension
 *  tanpa perlu re-fetch tabel campaign. */
export async function GET(request: Request) {
  const user = await getMetaAdsApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const rangeParam = searchParams.get("range") ?? "last_30d"
  const range: MetaAdsDatePreset = VALID_PRESETS.has(rangeParam as MetaAdsDatePreset) ? (rangeParam as MetaAdsDatePreset) : "last_30d"
  const dimensionParam = searchParams.get("dimension") ?? "age"
  const dimension: MetaAdsBreakdownDimension = VALID_DIMENSIONS.has(dimensionParam as MetaAdsBreakdownDimension)
    ? (dimensionParam as MetaAdsBreakdownDimension)
    : "age"

  const account = await getActiveMetaAdsAccount()
  if (!account) return NextResponse.json({ error: "Belum ada akun Meta Ads yang dikonek — isi dulu di Pengaturan modul ini" }, { status: 404 })

  try {
    const [trend, breakdown] = await Promise.all([
      fetchDailyTrend(account.adAccountId, account.accessToken, range),
      fetchBreakdownInsights(account.adAccountId, account.accessToken, range, dimension),
    ])
    await recordSyncResult(account.id, null)
    return NextResponse.json({ range, dimension, trend, breakdown })
  } catch (err) {
    const message = err instanceof MetaAdsApiError ? err.message : err instanceof Error ? err.message : "Gagal mengambil data dari Meta"
    await recordSyncResult(account.id, message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
