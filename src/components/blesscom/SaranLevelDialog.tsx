"use client"

import { useEffect } from "react"
import { Check, RotateCcw, Send, Sparkles } from "lucide-react"

import { Alert, Button, Modal, Spinner } from "@/components/ui"
import { levelLabel, useLevelChat, type LevelChatItem } from "@/lib/use-level-chat"

const STARTER_HINTS = [
  "Client minta tambah master data produk yang ada kategori dan satuannya.",
  "Minta laporan penjualan per sales, bisa difilter bulan dan dibandingkan bulan lalu.",
  "Minta tombol cetak surat jalan dari data pengiriman yang sudah ada.",
]

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export interface SaranLevelPick {
  itemId: string
  groupName: string
  level: string | null
  label: string
  price: number
}

/**
 * Dialog "Saran Perhitungan" di form Daftar Pekerjaan: obrolan yang SAMA dengan menu Pengajuan
 * Pekerjaan (mesinnya useLevelChat), bedanya hasilnya tidak disimpan jadi riwayat simulasi —
 * langsung dipakai mengisi kategori, level, dan harga di baris detail yang sedang diisi.
 *
 * Kalau AI menyimpulkan beberapa pekerjaan sekaligus, tiap hasil punya tombol "Pakai" sendiri;
 * yang dipakai cuma satu (baris yang sedang diisi) — sisanya tinggal diisi di baris lain.
 */
export const SaranLevelDialog: React.FC<{
  isOpen: boolean
  onClose: () => void
  /** Deskripsi pekerjaan yang sudah diketik di baris — dipakai sebagai kalimat pembuka. */
  prefill?: string
  onPick: (pick: SaranLevelPick) => void
}> = ({ isOpen, onClose, prefill, onPick }) => {
  const {
    timelineRef,
    description,
    setDescription,
    messages,
    answerType,
    choices,
    picked,
    setPicked,
    answer,
    setAnswer,
    items,
    done,
    loading,
    error,
    maxQuestions,
    setMaxQuestions,
    questionsAsked,
    started,
    startChat,
    submitAnswer,
    reset,
  } = useLevelChat()

  // Deskripsi pekerjaan yang sudah diketik di baris dipakai sebagai kalimat pembuka — diisi sekali
  // saat dialog dibuka, setelah itu bebas diedit (termasuk dikosongkan) oleh staf.
  useEffect(() => {
    if (isOpen && prefill) setDescription(prefill)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const pakai = (it: LevelChatItem) => {
    onPick({ itemId: it.itemId, groupName: it.groupName, level: it.level, label: it.label, price: it.unitPrice })
    reset()
    onClose()
  }

  const tutup = () => {
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={tutup}
      size="lg"
      title="Saran Perhitungan"
      subtitle={
        !started
          ? "Jelaskan pekerjaannya, AI bantu tentukan kategori & levelnya"
          : done
            ? "Selesai — pilih hasil yang dipakai"
            : `${questionsAsked}/${maxQuestions} pertanyaan`
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          {started ? (
            <Button variant="ghost" size="sm" onClick={reset} leftIcon={<RotateCcw className="w-4 h-4" />}>
              Mulai Ulang
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={tutup}>
            Tutup
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}

        <div ref={timelineRef} className="max-h-[22rem] overflow-y-auto flex flex-col gap-2.5 pr-1">
          {!started ? (
            <div className="text-center space-y-4 py-2">
              <span className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </span>
              <p className="text-xs text-slate-500 font-medium">
                Acuan Blesscom murni kategori &amp; level — tanpa hitung bobot.
              </p>
              <div className="flex flex-col gap-1.5">
                {STARTER_HINTS.map((h) => (
                  <button
                    key={h}
                    onClick={() => startChat(h)}
                    className="text-left rounded-xl border border-slate-200/80 bg-white/70 hover:bg-blue-50 hover:border-blue-400 px-3 py-2 text-xs font-medium text-slate-600 transition-colors"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-medium max-w-[90%] whitespace-pre-wrap ${
                    m.role === "assistant" ? "bg-blue-50 text-blue-900 self-start" : "bg-slate-800 text-white self-end"
                  }`}
                >
                  {m.text}
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium self-start">
                  <Spinner size="sm" />
                  sedang menganalisa...
                </div>
              )}

              {done && (
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Hasil: Kategori &amp; Level</p>

                  {items.length === 0 && (
                    <p className="text-sm text-slate-500 font-medium">
                      Belum bisa ditentukan — coba jelaskan lagi lebih spesifik.
                    </p>
                  )}

                  {items.map((it) => (
                    <div
                      key={it.key}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-slate-200/70 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">{levelLabel(it)}</p>
                        <p className="text-xs text-slate-500 italic mt-0.5">{it.alasan}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                        {formatRupiah(it.unitPrice)}
                      </span>
                      <Button size="sm" onClick={() => pakai(it)} leftIcon={<Check className="w-4 h-4" />}>
                        Pakai
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!started && (
          <div className="flex gap-2 items-end">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  startChat(description)
                }
              }}
              rows={2}
              placeholder="Tulis pekerjaan yang diminta client Blesscom..."
              className="flex-1 resize-none max-h-32 overflow-y-auto px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/70 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            <Button onClick={() => startChat(description)} disabled={loading || !description.trim()}>
              {loading ? <Spinner size="sm" color="white" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        )}

        {started && !done && !loading && choices.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => {
                const active = answerType === "checkbox" && picked.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() =>
                      answerType === "checkbox"
                        ? setPicked((prev) => (active ? prev.filter((p) => p !== c) : [...prev, c]))
                        : submitAnswer(c)
                    }
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs sm:text-sm font-medium transition-colors text-left ${
                      active
                        ? "border-blue-500 bg-blue-50 text-blue-900"
                        : "border-slate-200/80 bg-white/80 text-slate-700 hover:bg-blue-50 hover:border-blue-400"
                    }`}
                  >
                    {answerType === "checkbox" && (
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          active ? "bg-blue-600 border-blue-600" : "border-slate-300"
                        }`}
                      >
                        {active && <Check className="w-3 h-3 text-white" />}
                      </span>
                    )}
                    {c}
                  </button>
                )
              })}
            </div>
            {answerType === "checkbox" && (
              <Button size="sm" onClick={() => submitAnswer(picked.join(", "))} disabled={picked.length === 0}>
                Kirim Pilihan
              </Button>
            )}
          </div>
        )}

        {started && !done && !loading && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                placeholder={choices.length > 0 ? "...atau jelaskan dengan kata-katamu sendiri" : "Ketik jawabanmu..."}
                className="flex-1 h-11 rounded-2xl border border-slate-200 bg-white/70 px-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                autoFocus
              />
              <Button onClick={() => submitAnswer()} disabled={!answer.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {questionsAsked > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => submitAnswer("Langsung tentukan saja kategori & levelnya.", { conclude: true })}
                >
                  Tentukan Sekarang
                </Button>
                {questionsAsked >= maxQuestions && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Batas {maxQuestions} pertanyaan tercapai.{" "}
                    <button
                      onClick={() => setMaxQuestions((n) => Math.min(15, n + 5))}
                      className="text-blue-700 font-bold hover:underline"
                    >
                      Gali lebih dalam
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
