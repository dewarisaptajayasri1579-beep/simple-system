"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, CheckCircle2, Info, TriangleAlert, OctagonAlert, ArrowRight } from "lucide-react"

import { Alert, Button, Card, Spinner } from "@/components/ui"

type Severity = "good" | "info" | "warning" | "critical"
type Finding = { title: string; severity: Severity; detail: string; action: string }
type Insight = { headline: string; findings: Finding[]; caveat: string; createdAt?: string }

/** Warna + ikon + label per severity. Ikon & label SELALU ikut ditampilkan (bukan cuma warna),
 *  supaya tingkat urgensi tetap kebaca buat yang buta warna atau saat di-print. */
const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; label: string; wrap: string; ring: string }> = {
  good: { icon: CheckCircle2, label: "Bagus", wrap: "bg-emerald-50 text-emerald-700", ring: "border-emerald-200" },
  info: { icon: Info, label: "Info", wrap: "bg-slate-100 text-slate-700", ring: "border-slate-200" },
  warning: { icon: TriangleAlert, label: "Perlu perhatian", wrap: "bg-amber-50 text-amber-700", ring: "border-amber-200" },
  critical: { icon: OctagonAlert, label: "Boros", wrap: "bg-rose-50 text-rose-700", ring: "border-rose-200" },
}

/** Analisa sekali jalan makan ~45 detik (tarik 7 endpoint Meta, lalu model mikir). Spinner polos
 *  selama itu bikin user ngira nge-hang, jadi tahapannya diceritakan + ada penghitung detik.
 *  Detik-detik di bawah cuma perkiraan urutan kerja, bukan progres asli dari server — tahap
 *  terakhir sengaja tidak punya batas waktu supaya tidak pernah "mentok" kalau prosesnya lebih
 *  lama dari biasanya. */
const LOADING_STAGES: { until: number; text: string }[] = [
  { until: 6, text: "Mengambil data campaign & tren harian dari Meta..." },
  { until: 14, text: "Mengambil breakdown usia, gender, wilayah & penempatan..." },
  { until: 30, text: "Membandingkan CTR, CPC, dan alokasi budget antar segmen..." },
  { until: Infinity, text: "Menyusun kesimpulan dan langkah tindak lanjut..." },
]

export function MetaAdsAiInsight({ range }: { range: string }) {
  const [insight, setInsight] = useState<Insight | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Bersihkan interval kalau user pindah halaman saat analisa masih jalan.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Ambil hasil analisa tersimpan terakhir untuk rentang ini — GET tidak memanggil model, jadi
  // gratis & instan. Tanpa ini kesimpulan hilang tiap refresh (state cuma di memori browser).
  useEffect(() => {
    let cancelled = false
    setInsight(null)
    setError(null)
    fetch(`/api/meta-ads/ai-insight?range=${range}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setInsight(body as Insight)
      })
      .catch(() => {
        /* riwayat tidak wajib ada — diamkan, tombol Analisa tetap bisa dipakai */
      })
    return () => {
      cancelled = true
    }
  }, [range])

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    setElapsed(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    try {
      const res = await fetch(`/api/meta-ads/ai-insight?range=${range}`, { method: "POST" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menganalisa")
      setInsight(body as Insight)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menganalisa")
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
      setLoading(false)
    }
  }

  return (
    <Card variant="feature" padding="none">
      <div className="p-4 sm:p-5 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">Kesimpulan AI</h2>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {insight?.createdAt
                ? `Dianalisa ${new Date(insight.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} — tersimpan, klik Analisa Ulang untuk angka terbaru.`
                : "Angka di atas dibaca otomatis — apa yang perlu diperbaiki dan kenapa."}
            </p>
          </div>
        </div>
        <Button onClick={runAnalysis} disabled={loading} variant={insight ? "secondary" : "primary"}>
          {loading ? "Menganalisa..." : insight ? "Analisa Ulang" : "Analisa dengan AI"}
        </Button>
      </div>

      <div className="p-4 sm:p-5">
        {error && (
          <Alert variant="error" title="Gagal menganalisa">
            {error}
          </Alert>
        )}

        {loading && (
          <div className="py-8 flex flex-col items-center gap-4" role="status" aria-live="polite">
            <Spinner />

            <div className="text-center">
              <p className="text-sm font-bold text-slate-700">
                {LOADING_STAGES.find((s) => elapsed < s.until)?.text ?? LOADING_STAGES[LOADING_STAGES.length - 1].text}
              </p>
              <p className="text-[11px] text-slate-500 font-semibold mt-1 tabular-nums">
                {elapsed} detik berjalan — biasanya selesai sekitar 45 detik
              </p>
            </div>

            {/* Checklist tahapan: yang sudah lewat dicentang, biar kelihatan jalan terus. */}
            <ol className="w-full max-w-sm space-y-1.5">
              {LOADING_STAGES.map((stage, i) => {
                const prevUntil = i === 0 ? 0 : LOADING_STAGES[i - 1].until
                const done = elapsed >= stage.until
                const active = elapsed >= prevUntil && !done
                return (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center ${
                        done ? "bg-emerald-100 text-emerald-700" : active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {done ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                    </span>
                    <span className={`text-[11px] leading-snug ${active ? "font-bold text-slate-700" : "font-semibold text-slate-400"}`}>
                      {stage.text}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {!loading && !insight && !error && (
          <p className="text-sm text-slate-500 font-medium text-center py-6">
            Klik &quot;Analisa dengan AI&quot; untuk membaca data di atas jadi kesimpulan yang bisa ditindaklanjuti.
          </p>
        )}

        {!loading && insight && (
          <div className="space-y-4">
            <p className="text-sm font-bold text-slate-800 leading-relaxed">{insight.headline}</p>

            <div className="space-y-3">
              {insight.findings.map((f, i) => {
                const style = SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.info
                const Icon = style.icon
                return (
                  <div key={i} className={`rounded-2xl border ${style.ring} p-3.5 bg-white/60`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${style.wrap}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800">{f.title}</p>
                          <span className={`text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${style.wrap}`}>
                            {style.label}
                          </span>
                        </div>
                        <p className="text-[13px] text-slate-600 font-medium mt-1 leading-relaxed">{f.detail}</p>
                        <div className="flex items-start gap-1.5 mt-2 text-blue-700">
                          <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <p className="text-[12px] font-semibold leading-relaxed">{f.action}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-[11px] text-slate-500 font-medium border-t border-slate-200/60 pt-3 leading-relaxed">
              <span className="font-bold">Catatan:</span> {insight.caveat}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
