"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText } from "lucide-react"

import { Alert, Button, Modal } from "@/components/ui"

export interface InvoiceKandidat {
  id: string
  /** ISO date */
  workDate: string
  items: { name: string; levelLabel: string; amount: number }[]
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

function totalOf(o: InvoiceKandidat) {
  return o.items.reduce((s, it) => s + it.amount, 0)
}

/**
 * Tombol "Buat Invoice" untuk pekerjaan Blesscom — satu invoice = satu principle.
 *
 * Transaksi yang sedang dibuka selalu ikut; transaksi LAIN dari principle yang sama yang belum
 * ditagih ditawarkan sebagai centangan, supaya client tidak terima banyak invoice kecil untuk
 * principle yang sama.
 *
 * Dua panggilan berurutan, sama seperti BuatInvoicePrincipleButton: (1) POST /api/invoices —
 * jalur pembuatan invoice yang SAMA dengan invoice manual (nomor invoice, BillingFollowUp,
 * aturan posting), lalu (2) POST /api/blesscom/pekerjaan/tandai-invoice buat menyambungkan
 * transaksinya. Tidak digabung supaya logika pembukuan invoice tidak dikembar.
 */
export const BuatInvoicePekerjaanButton: React.FC<{
  current: InvoiceKandidat
  others: InvoiceKandidat[]
  principleName: string
  companyName: string
  clientId: string | null
}> = ({ current, others, principleName, companyName, clientId }) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extraIds, setExtraIds] = useState<string[]>([])

  const selected = [current, ...others.filter((o) => extraIds.includes(o.id))]
  const total = selected.reduce((s, o) => s + totalOf(o), 0)

  const toggleExtra = (id: string) =>
    setExtraIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))

  const submit = async () => {
    if (!clientId) return
    setBusy(true)
    setError(null)
    try {
      const lines = selected.flatMap((o) =>
        o.items.map((it) => ({
          description: `${principleName} — ${it.name} (${it.levelLabel})`,
          qty: 1,
          unitPrice: it.amount,
        })),
      )

      const invRes = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          notes: `Pekerjaan ${principleName} — ${companyName}`,
          lines,
        }),
      })
      const invoice = await invRes.json().catch(() => null)
      if (!invRes.ok) {
        setError(invoice?.error || "Gagal membuat invoice")
        return
      }

      const tandaiRes = await fetch("/api/blesscom/pekerjaan/tandai-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, workOrderIds: selected.map((o) => o.id) }),
      })
      if (!tandaiRes.ok) {
        const d = await tandaiRes.json().catch(() => null)
        // Invoice-nya sudah jadi — arahkan ke invoicenya, jangan bikin user mengira gagal total.
        setError(
          `Invoice ${invoice.invoiceNumber} sudah dibuat, tapi transaksinya gagal ditandai sudah ditagih: ${
            d?.error ?? "error tidak diketahui"
          }`,
        )
        return
      }

      router.push(`/penjualan/${invoice.id}`)
    } catch {
      setError("Gagal menghubungi server")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} leftIcon={<FileText className="w-4 h-4" />}>
        Buat Invoice
      </Button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Invoice Pekerjaan — ${principleName}`}
        subtitle={`${companyName} · ${selected.length} transaksi · ${selected.reduce((s, o) => s + o.items.length, 0)} baris pekerjaan`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={submit} isLoading={busy} disabled={!clientId || total <= 0}>
              Buat Invoice
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {error && <Alert variant="error">{error}</Alert>}
          {!clientId && (
            <Alert variant="warning">
              Perusahaan <strong>{companyName}</strong> belum ditautkan ke Client — atur dulu di menu Blesscom ›
              Perusahaan, baru invoice bisa dibuat.
            </Alert>
          )}

          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Transaksi lain {principleName} yang belum ditagih
              </p>
              {others.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-white/70 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={extraIds.includes(o.id)}
                    onChange={() => toggleExtra(o.id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="flex-1 text-sm font-semibold text-slate-800">
                    {formatDate(o.workDate)}
                    <span className="text-slate-500 font-medium"> · {o.items.length} pekerjaan</span>
                  </span>
                  <span className="text-sm font-bold text-slate-900">{formatRupiah(totalOf(o))}</span>
                </label>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            {selected.flatMap((o) =>
              o.items.map((it, i) => (
                <div
                  key={`${o.id}-${i}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{it.name}</p>
                    <p className="text-xs text-slate-500">
                      {it.levelLabel} · {formatDate(o.workDate)}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-slate-900 whitespace-nowrap">{formatRupiah(it.amount)}</p>
                </div>
              )),
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">
              <p className="text-sm font-black text-slate-700">Total</p>
              <p className="text-base font-black text-emerald-700">{formatRupiah(total)}</p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Invoice dibuat sebagai <strong>Draft</strong> seperti invoice lain — posting dilakukan dari halaman invoice.
            Transaksi yang sudah ditagihkan tidak bisa diubah lagi di menu ini.
          </p>
        </div>
      </Modal>
    </>
  )
}
