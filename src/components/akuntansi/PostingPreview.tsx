"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, AlertTriangle, Info } from "lucide-react"
import { Alert } from "@/components/ui"

export type PostingPreviewKind =
  | "transaction"
  | "transaction-void"
  | "payment"
  | "payment-void"
  | "account-transfer"
  | "account-transfer-void"
  | "journal-entry"
  | "journal-entry-void"
  | "invoice"
  | "revenue-slot"

interface PreviewRow {
  label: string
  value: string
  tone?: "default" | "negative" | "positive" | "total"
}

interface PreviewBalance {
  accountName: string
  current: number
  delta: number
  after: number
}

export interface PostingPreviewData {
  title: string
  headline: string
  rows: PreviewRow[]
  detailLabel?: string
  detailRows?: PreviewRow[]
  balances: PreviewBalance[]
  balanceLabel?: string
  blocked: boolean
  blockMessage?: string
  warning?: string
  confirmLabel: string
  isVoid?: boolean
}

function rupiah(n: number) {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`
}

/** Ambil resume + proyeksi saldo dari server tiap kali dialog konfirmasi dibuka (bukan sekali
 *  saat halaman dimuat) — supaya saldo yang ditampilkan selalu yang terbaru, termasuk kalau ada
 *  transaksi lain yang diposting orang lain sambil halaman ini dibiarkan terbuka. */
export function usePostingPreview(
  kind: PostingPreviewKind,
  id: string,
  open: boolean,
  feeOverrides?: Record<string, boolean>
) {
  const [preview, setPreview] = useState<PostingPreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const feeKey = useMemo(() => (feeOverrides ? JSON.stringify(feeOverrides) : ""), [feeOverrides])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError("")
    setPreview(null)
    const qs = new URLSearchParams({ kind, id })
    if (feeKey) qs.set("feeOverrides", feeKey)
    fetch(`/api/posting-preview?${qs.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok) {
          setError(data?.error || "Gagal menyiapkan konfirmasi")
          return
        }
        setPreview(data as PostingPreviewData)
      })
      .catch(() => {
        if (!cancelled) setError("Gagal menyiapkan konfirmasi")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, id, open, feeKey])

  return { preview, loading, error }
}

const TONE_CLASS: Record<NonNullable<PreviewRow["tone"]>, string> = {
  default: "text-slate-900",
  negative: "text-rose-700",
  positive: "text-emerald-700",
  total: "text-slate-900 font-black",
}

/** Isi dialog konfirmasi: kalimat konfirmasi + resume inputan + "Lihat rincian" + blok saldo
 *  (sekarang -> transaksi ini -> setelah posting). Dipakai bareng oleh tombol Posting
 *  (PostingConfirmButton) dan tombol Batalkan (VoidButton), supaya dua-duanya selalu menampilkan
 *  informasi yang sama bentuknya. */
export const PostingPreviewBody: React.FC<{
  preview: PostingPreviewData | null
  loading: boolean
  error: string
}> = ({ preview, loading, error }) => {
  const [detailOpen, setDetailOpen] = useState(false)

  if (loading) return <p className="text-sm text-slate-500">Menghitung resume & saldo...</p>
  if (error) return <Alert variant="error">{error}</Alert>
  if (!preview) return null

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 font-medium leading-relaxed">{preview.headline}</p>

      <div className="rounded-2xl border border-slate-200/80 bg-white/60 divide-y divide-slate-100">
        {preview.rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span className={`text-right font-semibold ${TONE_CLASS[row.tone ?? "default"]}`}>{row.value}</span>
          </div>
        ))}
      </div>

      {preview.detailRows && preview.detailRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 uppercase hover:bg-slate-50 cursor-pointer"
          >
            {detailOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {preview.detailLabel ?? "Lihat rincian"}
          </button>
          {detailOpen && (
            <div className="divide-y divide-slate-100 border-t border-slate-200/80">
              {preview.detailRows.map((row, i) => (
                <div key={`${row.label}-${i}`} className="flex items-start justify-between gap-4 px-4 py-2 text-sm">
                  <span className="text-slate-600">{row.label}</span>
                  <span className={`text-right font-semibold ${TONE_CLASS[row.tone ?? "default"]}`}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preview.balances.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">{preview.balanceLabel ?? "Saldo setelah posting"}</p>
          {preview.balances.map((b) => (
            <div key={b.accountName} className="rounded-2xl border border-slate-200/80 bg-white/60 px-4 py-3 text-sm space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Saldo {b.accountName} sekarang</span>
                <span className="font-semibold text-slate-900">{rupiah(b.current)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Transaksi ini</span>
                <span className={`font-semibold ${b.delta < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {b.delta < 0 ? "−" : "+"} {rupiah(Math.abs(b.delta))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-slate-200">
                <span className="font-bold text-slate-700">Saldo setelah</span>
                <span className={`font-black ${b.after < -0.5 ? "text-rose-700" : "text-slate-900"}`}>
                  {b.after < 0 ? `−${rupiah(Math.abs(b.after))}` : rupiah(b.after)}
                  {b.after < -0.5 && " ⛔"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview.blocked && preview.blockMessage && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-rose-800 font-semibold">{preview.blockMessage}</p>
        </div>
      )}

      {!preview.blocked && preview.warning && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-semibold">{preview.warning}</p>
        </div>
      )}
    </div>
  )
}
