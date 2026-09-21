import { NextResponse } from "next/server"

import { getMetaAdsApiUser } from "@/lib/meta-ads/access"
import { fetchAccountSummary, fetchCampaignInsights, getActiveMetaAdsAccount, MetaAdsApiError, recordSyncResult, type MetaAdsDatePreset } from "@/lib/meta-ads/client"

const VALID_PRESETS = new Set<MetaAdsDatePreset>(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"])

/** GET /api/meta-ads/campaigns?range=last_30d — breakdown performa per campaign + ringkasan akun.
 *  Fetch langsung ke Meta Graph API tiap request (tidak ada tabel cache) karena data insight
 *  sendiri sudah di-agregasi Meta per hari, jadi tidak perlu disimpan ulang di DB kita. */
export async function GET(request: Request) {
  const user = await getMetaAdsApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const rangeParam = searchParams.get("range") ?? "last_30d"
  const range: MetaAdsDatePreset = VALID_PRESETS.has(rangeParam as MetaAdsDatePreset) ? (rangeParam as MetaAdsDatePreset) : "last_30d"

  const account = await getActiveMetaAdsAccount()
  if (!account) return NextResponse.json({ error: "Belum ada akun Meta Ads yang dikonek — isi dulu di Pengaturan modul ini" }, { status: 404 })

  try {
    const [summary, campaigns] = await Promise.all([
      fetchAccountSummary(account.adAccountId, account.accessToken, range),
      fetchCampaignInsights(account.adAccountId, account.accessToken, range),
    ])
    await recordSyncResult(account.id, null)
    return NextResponse.json({ accountName: account.name, range, summary, campaigns })
  } catch (err) {
    const message = err instanceof MetaAdsApiError ? err.message : err instanceof Error ? err.message : "Gagal mengambil data dari Meta"
    await recordSyncResult(account.id, message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
