import { decryptSecret } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

const GRAPH_API_VERSION = "v21.0"
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export type MetaAdsDatePreset = "today" | "yesterday" | "last_7d" | "last_14d" | "last_30d" | "this_month" | "last_month"

/** Metrik niat beli dari `actions` Meta. Klik cuma menandakan penasaran; yang benar-benar
 *  mendekati "orang ini butuh" adalah dia MULAI chat, lalu LANJUT sampai beberapa pesan.
 *  Dipakai sebagai patokan utama menggantikan CPC — lihat catatan di ai-insight.ts. */
export type MetaConversionMetrics = {
  /** Orang yang membuka percakapan WhatsApp/Messenger dari iklan (7 hari). */
  conversationsStarted: number
  /** Yang lanjut sampai ±5 pesan — paling dekat ke calon pembeli sungguhan. */
  deepConversations: number
  /** Memblokir iklan/pesannya — sinyal audiens salah sasaran atau iklan mengganggu. */
  blocks: number
  /** spend ÷ conversationsStarted. null kalau belum ada percakapan sama sekali. */
  costPerConversation: number | null
  /** spend ÷ deepConversations — angka yang paling layak jadi patokan keputusan budget. */
  costPerDeepConversation: number | null
}

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
} & MetaConversionMetrics

export type MetaAdsAccountSummary = {
  currency: string
  totalSpend: number
  totalImpressions: number
  totalReach: number
  totalClicks: number
} & MetaConversionMetrics

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
} & MetaConversionMetrics

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

/** Nama action di Meta. "depth_5" artinya percakapan mencapai ±5 pesan — Meta tidak
 *  menyediakan "jumlah closing", jadi ini proxy terdekat yang tersedia untuk niat beli. */
const ACTION_CONVERSATION_STARTED = "onsite_conversion.messaging_conversation_started_7d"
const ACTION_DEEP_CONVERSATION = "onsite_conversion.messaging_user_depth_5_message_send"
const ACTION_BLOCK = "onsite_conversion.messaging_block"

type MetaActionEntry = { action_type?: string; value?: string | number }

function actionValue(actions: unknown, type: string): number {
  if (!Array.isArray(actions)) return 0
  const hit = (actions as MetaActionEntry[]).find((a) => a?.action_type === type)
  return hit ? num(hit.value) : 0
}

/** Ekstrak metrik niat beli dari satu baris insight. Akun yang belum pernah pakai iklan
 *  percakapan akan mengembalikan semua nol — itu wajar, bukan error. */
function extractConversionMetrics(row: Record<string, unknown>, spend: number): MetaConversionMetrics {
  const conversationsStarted = actionValue(row.actions, ACTION_CONVERSATION_STARTED)
  const deepConversations = actionValue(row.actions, ACTION_DEEP_CONVERSATION)
  return {
    conversationsStarted,
    deepConversations,
    blocks: actionValue(row.actions, ACTION_BLOCK),
    costPerConversation: conversationsStarted > 0 ? spend / conversationsStarted : null,
    costPerDeepConversation: deepConversations > 0 ? spend / deepConversations : null,
  }
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
    fields: "campaign_id,campaign_name,objective,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    limit: "500",
  })

  const statusById = await fetchCampaignStatuses(adAccountId, accessToken)

  const rows: MetaCampaignInsight[] = (body.data ?? []).map((row: Record<string, unknown>) => {
    const spend = num(row.spend)
    return {
      campaignId: String(row.campaign_id),
      campaignName: String(row.campaign_name ?? "-"),
      status: statusById.get(String(row.campaign_id)) ?? "UNKNOWN",
      objective: (row.objective as string) ?? null,
      spend,
      impressions: num(row.impressions),
      reach: num(row.reach),
      clicks: num(row.clicks),
      ctr: num(row.ctr),
      cpc: num(row.cpc),
      cpm: num(row.cpm),
      ...extractConversionMetrics(row, spend),
    }
  })

  // Diurutkan dari yang paling efisien menghasilkan percakapan serius — bukan dari spend
  // terbesar. Campaign tanpa percakapan sama sekali ditaruh di bawah.
  return rows.sort((a, b) => {
    if (a.costPerDeepConversation === null && b.costPerDeepConversation === null) return b.spend - a.spend
    if (a.costPerDeepConversation === null) return 1
    if (b.costPerDeepConversation === null) return -1
    return a.costPerDeepConversation - b.costPerDeepConversation
  })
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
      fields: "spend,impressions,reach,clicks,actions",
    }),
    graphGet(`/${adAccountId}`, accessToken, { fields: "currency" }),
  ])

  const row = insightsBody.data?.[0] ?? {}
  const totalSpend = num(row.spend)
  return {
    currency: accountBody.currency ?? "IDR",
    totalSpend,
    totalImpressions: num(row.impressions),
    totalReach: num(row.reach),
    totalClicks: num(row.clicks),
    ...extractConversionMetrics(row, totalSpend),
  }
}

/** Tren harian akun (bukan per-campaign) — dasar chart "Analisa Performa". `time_increment=1`
 *  bikin Meta pecah 1 response jadi 1 baris per tanggal, jadi tetap 1 call API apa pun panjang
 *  rentangnya. */
export async function fetchDailyTrend(adAccountId: string, accessToken: string, datePreset: MetaAdsDatePreset): Promise<MetaAdsDailyPoint[]> {
  const body = await graphGet(`/${adAccountId}/insights`, accessToken, {
    date_preset: datePreset,
    time_increment: "1",
    fields: "spend,impressions,clicks,ctr,cpc",
    limit: "500",
  })

  return (body.data ?? [])
    .map((row: Record<string, unknown>) => ({
      date: String(row.date_start),
      spend: num(row.spend),
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      ctr: num(row.ctr),
      cpc: num(row.cpc),
    }))
    .sort((a: MetaAdsDailyPoint, b: MetaAdsDailyPoint) => a.date.localeCompare(b.date))
}

const BREAKDOWN_FIELD: Record<Exclude<MetaAdsBreakdownDimension, "placement">, string> = {
  age: "age",
  gender: "gender",
  region: "region",
}

const GENDER_LABEL: Record<string, string> = { male: "Laki-laki", female: "Perempuan", unknown: "Tidak diketahui" }

/** Breakdown performa per segmen audiens ("Target Market") — dipakai buat lihat segmen umur/
 *  gender/wilayah/penempatan mana yang CTR-nya paling tinggi / CPC-nya paling murah dari
 *  campaign yang SUDAH jalan, sebagai dasar data nentuin target audience berikutnya. "placement"
 *  gabungan 2 breakdown Meta (publisher_platform + platform_position) jadi 1 label supaya lebih
 *  gampang dibaca ("Facebook Feed" dst). */
export async function fetchBreakdownInsights(
  adAccountId: string,
  accessToken: string,
  datePreset: MetaAdsDatePreset,
  dimension: MetaAdsBreakdownDimension
): Promise<MetaAdsBreakdownRow[]> {
  const breakdowns = dimension === "placement" ? "publisher_platform,platform_position" : BREAKDOWN_FIELD[dimension]
  const body = await graphGet(`/${adAccountId}/insights`, accessToken, {
    date_preset: datePreset,
    breakdowns,
    fields: "spend,impressions,clicks,ctr,cpc,actions",
    limit: "500",
  })

  const rows: MetaAdsBreakdownRow[] = (body.data ?? []).map((row: Record<string, unknown>) => {
    const spend = num(row.spend)
    return {
      label: labelForBreakdownRow(dimension, row),
      spend,
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      ctr: num(row.ctr),
      cpc: num(row.cpc),
      ...extractConversionMetrics(row, spend),
    }
  })

  // Segmen yang menghasilkan percakapan serius PALING MURAH duluan — itu yang mendekati
  // "orang yang butuh". Segmen yang cuma ramai klik tapi nol percakapan jatuh ke bawah,
  // walau CTR-nya tinggi (kasus nyata: klik murah tapi tidak ada yang lanjut chat).
  return rows.sort((a, b) => {
    if (a.costPerDeepConversation === null && b.costPerDeepConversation === null) return b.ctr - a.ctr
    if (a.costPerDeepConversation === null) return 1
    if (b.costPerDeepConversation === null) return -1
    return a.costPerDeepConversation - b.costPerDeepConversation
  })
}

function labelForBreakdownRow(dimension: MetaAdsBreakdownDimension, row: Record<string, unknown>): string {
  if (dimension === "gender") {
    const gender = String(row.gender ?? "unknown")
    return GENDER_LABEL[gender] ?? gender
  }
  if (dimension === "placement") {
    const platform = String(row.publisher_platform ?? "-")
    const position = String(row.platform_position ?? "-")
    return `${platform} · ${position}`
  }
  return String(row[BREAKDOWN_FIELD[dimension as Exclude<MetaAdsBreakdownDimension, "placement">]] ?? "-")
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
