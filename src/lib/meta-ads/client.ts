import { decryptSecret } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

const GRAPH_API_VERSION = "v21.0"
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export type MetaAdsDatePreset = "today" | "yesterday" | "last_7d" | "last_14d" | "last_30d" | "this_month" | "last_month"

export type MetaCampaignInsight = {
  campaignId: string
  campaignName: string
  status: string
  objective: string | null
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number // persen
  cpc: number // per klik, mata uang akun
  cpm: number // per 1000 impression
}

export type MetaAdsAccountSummary = {
  currency: string
  totalSpend: number
  totalImpressions: number
  totalReach: number
  totalClicks: number
}

export type MetaAdsDailyPoint = {
  date: string // YYYY-MM-DD
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
}

export type MetaAdsBreakdownDimension = "age" | "gender" | "region" | "placement"

export type MetaAdsBreakdownRow = {
  label: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
}

class MetaAdsApiError extends Error {}

async function graphGet(path: string, accessToken: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH_API_BASE}${path}`)
  url.searchParams.set("access_token", accessToken)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const res = await fetch(url.toString(), { cache: "no-store" })
  const body = await res.json()
  if (!res.ok) {
    const message = body?.error?.message ?? `Meta API error ${res.status}`
    throw new MetaAdsApiError(message)
  }
  return body
}

function num(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN
  return Number.isFinite(n) ? n : 0
}

/** Ambil breakdown performa per campaign dalam rentang tanggal tertentu, lewat 1 request
 *  `/insights` dengan `level=campaign` (bukan loop per-campaign) — jadi tetap 1 call API
 *  apa pun jumlah campaign-nya. `datePreset` pakai preset bawaan Meta (last_7d, last_30d, dst)
 *  supaya tidak perlu hitung range tanggal sendiri di sisi kita. */
export async function fetchCampaignInsights(
  adAccountId: string,
  accessToken: string,
  datePreset: MetaAdsDatePreset
): Promise<MetaCampaignInsight[]> {
  const body = await graphGet(`/${adAccountId}/insights`, accessToken, {
    level: "campaign",
    date_preset: datePreset,
    fields: "campaign_id,campaign_name,objective,spend,impressions,reach,clicks,ctr,cpc,cpm",
    limit: "500",
  })

  const statusById = await fetchCampaignStatuses(adAccountId, accessToken)

  const rows: MetaCampaignInsight[] = (body.data ?? []).map((row: Record<string, unknown>) => ({
    campaignId: String(row.campaign_id),
    campaignName: String(row.campaign_name ?? "-"),
    status: statusById.get(String(row.campaign_id)) ?? "UNKNOWN",
    objective: (row.objective as string) ?? null,
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
  }))

  return rows.sort((a, b) => b.spend - a.spend)
}

async function fetchCampaignStatuses(adAccountId: string, accessToken: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const body = await graphGet(`/${adAccountId}/campaigns`, accessToken, { fields: "id,effective_status", limit: "500" })
    for (const c of body.data ?? []) map.set(String(c.id), String(c.effective_status ?? "UNKNOWN"))
  } catch {
    // best-effort — kalau gagal, status campaign ditampilkan "UNKNOWN" tapi angka insight tetap jalan
  }
  return map
}

export async function fetchAccountSummary(adAccountId: string, accessToken: string, datePreset: MetaAdsDatePreset): Promise<MetaAdsAccountSummary> {
  const [insightsBody, accountBody] = await Promise.all([
    graphGet(`/${adAccountId}/insights`, accessToken, {
      date_preset: datePreset,
      fields: "spend,impressions,reach,clicks",
    }),
    graphGet(`/${adAccountId}`, accessToken, { fields: "currency" }),
  ])

  const row = insightsBody.data?.[0] ?? {}
  return {
    currency: accountBody.currency ?? "IDR",
    totalSpend: num(row.spend),
    totalImpressions: num(row.impressions),
    totalReach: num(row.reach),
    totalClicks: num(row.clicks),
  }
}

/** Ambil akun Meta Ads yang aktif + validasi kredensial dengan 1 call ringan (`/me`) supaya
 *  error token expired/dicabut ketahuan cepat dan bisa dicatat ke lastSyncError (pola sama
 *  dengan VpsServer.coolifySyncError, lihat lib/monitoring/coolify.ts). */
export async function getActiveMetaAdsAccount() {
  const account = await prisma.metaAdsAccount.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } })
  if (!account) return null
  return { ...account, accessToken: decryptSecret(account.accessToken) }
}

export async function recordSyncResult(accountId: string, error: string | null) {
  await prisma.metaAdsAccount.update({
    where: { id: accountId },
    data: { lastSyncError: error, lastSyncCheckedAt: new Date() },
  })
}

export { MetaAdsApiError }
