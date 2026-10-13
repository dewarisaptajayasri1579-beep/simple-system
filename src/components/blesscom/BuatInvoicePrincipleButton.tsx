"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText } from "lucide-react"

import { Alert, Button, Modal } from "@/components/ui"

export interface PreviewLine {
  label: string
  qty: number
  unitPrice: number
  total: number
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

/**
 * Tombol "Buat Invoice Over Principle".
 *
 * Dua panggilan berurutan, sengaja: (1) POST /api/invoices — jalur pembuatan invoice yang SAMA
 * dengan invoice manual (nomor invoice, BillingFollowUp, aturan "invoice tidak menjurnal"), lalu
 * (2) POST /api/principle-invoices — menandai invoice itu sebagai Invoice Over Principle +
 * menyimpan snapshot daftar principle buat lampiran cetak. Tidak digabung jadi satu endpoint
 * supaya tidak ada logika pembukuan invoice yang dikembar di dua tempat.
 */
export const BuatInvoicePrincipleButton: React.FC<{
  companyId: string
  companyName: string
  clientId: string
  monthIso: string
  monthLabel: string
  lines: PreviewLine[]
  principleCount: number
  existingInvoiceNumber: string | null
}> = ({ companyId, companyName, clientId, monthIso, monthLabel, lines, principleCount, existingInvoiceNumber }) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = lines.reduce((s, l) => s + l.total, 0)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const invRes = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          notes: `Over Principle ${companyName} — ${monthLabel} (${principleCount} principle aktif)`,
          lines: lines.map((l) => ({ description: l.label, qty: l.qty, unitPrice: l.unitPrice })),
        }),
      })
      const invoice = await invRes.json().catch(() => null)
      if (!invRes.ok) {
        setError(invoice?.error || "Gagal membuat invoice")
        return
      }

      const snapRes = await fetch("/api/principle-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, companyId, periodMonth: monthIso }),
      })
      if (!snapRes.ok) {
        const d = await snapRes.json().catch(() => null)
        // Invoice-nya sudah jadi — jangan bikin user mengira gagal total, arahkan ke invoicenya.
        setError(
          `Invoice ${invoice.invoiceNumber} sudah dibuat, tapi lampiran daftar principle gagal disimpan: ${
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
      <Button
        onClick={() => setOpen(true)}
        disabled={lines.length === 0 || !clientId}
        leftIcon={<FileText className="w-4 h-4" />}
      >
        Buat Invoice {monthLabel}
      </Button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Invoice Over Principle — ${companyName}`}
        subtitle={`Periode ${monthLabel} · ${principleCount} principle ikut ditagih`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={submit} isLoading={busy}>
              Buat Invoice
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {error && <Alert variant="error">{error}</Alert>}
          {existingInvoiceNumber && (
            <Alert variant="warning">
              Bulan {monthLabel} sudah pernah dibuat invoice principle: <strong>{existingInvoiceNumber}</strong>. Lanjut
              hanya kalau memang perlu invoice tambahan/pengganti.
            </Alert>
          )}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            {lines.map((l) => (
              <div key={l.label} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{l.label}</p>
                  <p className="text-xs text-slate-500">
                    {l.qty} × {formatRupiah(l.unitPrice)}
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-900">{formatRupiah(l.total)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">
              <p className="text-sm font-black text-slate-700">Total</p>
              <p className="text-base font-black text-emerald-700">{formatRupiah(total)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Invoice dibuat sebagai <strong>Draft</strong> seperti invoice lain — posting dilakukan dari halaman invoice.
            Daftar principle ikut tersimpan sebagai lampiran yang tercetak di halaman kedua nota.
          </p>
        </div>
      </Modal>
    </>
  )
}
