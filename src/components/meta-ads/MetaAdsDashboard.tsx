"use client"

import { useEffect, useState } from "react"
import { Megaphone, MousePointerClick, Eye, Wallet, RefreshCw } from "lucide-react"

import { Alert, Badge, Card, Select, Spinner, StatTile } from "@/components/ui"
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table"
import { MetaAdsAnalysis } from "./MetaAdsAnalysis"

type MetaCampaignRow = {
  campaignId: string
  campaignName: string
  status: string
  objective: string | null
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
}

type CampaignsResponse = {
  accountName: string
  range: string
  summary: { currency: string; totalSpend: number; totalImpressions: number; totalReach: number; totalClicks: number }
  campaigns: MetaCampaignRow[]
}

const RANGE_OPTIONS = [
  { value: "today", label: "Hari Ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "last_7d", label: "7 Hari Terakhir" },
  { value: "last_14d", label: "14 Hari Terakhir" },
  { value: "last_30d", label: "30 Hari Terakhir" },
  { value: "this_month", label: "Bulan Ini" },
  { value: "last_month", label: "Bulan Lalu" },
]

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "danger" }> = {
  ACTIVE: { label: "Aktif", variant: "success" },
  PAUSED: { label: "Dijeda", variant: "warning" },
  ARCHIVED: { label: "Arsip", variant: "secondary" },
  DELETED: { label: "Dihapus", variant: "danger" },
  UNKNOWN: { label: "Tidak diketahui", variant: "secondary" },
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString("id-ID")}`
  }
}

function formatNumber(value: number) {
  return value.toLocaleString("id-ID")
}

export function MetaAdsDashboard() {
  const [range, setRange] = useState("last_30d")
  const [data, setData] = useState<CampaignsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/meta-ads/campaigns?range=${range}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? "Gagal mengambil data")
        return body as CampaignsResponse
      })
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal mengambil data")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  // Angka turunan buat keterangan di bawah tiap kartu — biar angka besarnya punya konteks
  // ("66.938 tampil" sendirian tidak berarti apa-apa; "rata-rata 2,1x per orang" baru berarti).
  const s = data?.summary
  const avgCpc = s && s.totalClicks > 0 ? Math.round(s.totalSpend / s.totalClicks) : null
  const avgCtr = s && s.totalImpressions > 0 ? ((s.totalClicks / s.totalImpressions) * 100).toFixed(2) : null
  const frequency = s && s.totalReach > 0 ? (s.totalImpressions / s.totalReach).toFixed(1) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">Performa Iklan</h1>
          {data && <p className="text-xs font-semibold text-slate-500 mt-0.5">Akun: {data.accountName}</p>}
        </div>
        <div className="w-full sm:w-56">
          <Select options={RANGE_OPTIONS} value={range} onChange={setRange} searchable={false} />
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Gagal memuat data Meta Ads">
          {error}
        </Alert>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Total Spend"
              value={formatCurrency(data.summary.totalSpend, data.summary.currency)}
              icon={Wallet}
              color="rose"
              hint={avgCpc !== null ? `Uang terpakai · Rp${formatNumber(avgCpc)} per klik` : "Uang yang sudah terpakai"}
            />
            <StatTile
              label="Impressions"
              value={formatNumber(data.summary.totalImpressions)}
              icon={Eye}
              color="blue"
              hint={frequency !== null ? `Iklan tampil · rata-rata ${frequency}× per orang` : "Berapa kali iklan tampil di layar"}
            />
            <StatTile
              label="Reach"
              value={formatNumber(data.summary.totalReach)}
              icon={Megaphone}
              color="purple"
              hint="Jumlah orang berbeda yang melihatnya"
            />
            <StatTile
              label="Clicks"
              value={formatNumber(data.summary.totalClicks)}
              icon={MousePointerClick}
              color="emerald"
              hint={avgCtr !== null ? `Yang meng-klik · CTR ${avgCtr}%` : "Berapa kali iklan di-klik"}
            />
          </div>

          <Card variant="feature" padding="none">
            <div className="p-4 sm:p-5 border-b border-slate-200/60 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-800">Breakdown per Campaign</h2>
              {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
            </div>
            {data.campaigns.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 font-medium text-center">Tidak ada campaign dengan data di rentang ini.</p>
            ) : (
              <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Reach</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                      <TableHead className="text-right">CPM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.campaigns.map((c) => {
                      const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.UNKNOWN
                      return (
                        <TableRow key={c.campaignId}>
                          <TableCell>
                            <p className="font-semibold text-slate-800">{c.campaignName}</p>
                            {c.objective && <p className="text-[11px] text-slate-500">{c.objective}</p>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(c.spend, data.summary.currency)}</TableCell>
                          <TableCell className="text-right">{formatNumber(c.impressions)}</TableCell>
                          <TableCell className="text-right">{formatNumber(c.reach)}</TableCell>
                          <TableCell className="text-right">{formatNumber(c.clicks)}</TableCell>
                          <TableCell className="text-right">{c.ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{formatCurrency(c.cpc, data.summary.currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(c.cpm, data.summary.currency)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>

          <MetaAdsAnalysis range={range} currency={data.summary.currency} />
        </>
      )}
    </div>
  )
}
