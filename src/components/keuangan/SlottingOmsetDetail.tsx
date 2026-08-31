"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardHeader, CardTitle, CardDescription, Button, Input, CurrencyInput, Alert, Badge, Modal } from "@/components/ui"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"

export interface SlottingOmsetDetailProps {
  isOwner: boolean
  slot: {
    id: string
    status: "draft" | "processed" | "skipped"
    grossAmount: number
    initialCostAmount: number
    additionalCostAmount: number
    netAmount: number | null
    operasionalAmount: number | null
    direksiAmount: number | null
    bonusAmount: number | null
    hppReserveAmount: number | null
    labaDitahanAmount: number | null
    transferFeeTotal: number | null
    payment: { id: string; paymentNumber: string; clientName: string; accountName: string }
    costLines: { id: string; description: string; amount: number }[]
    transfers: { id: string; destinationAccountName: string; amount: number; journalEntryId: string | null }[]
  }
  settingsPreview: {
    operasionalPct: number
    direksiPct: number
    bonusPct: number
    hppReservePct: number
    labaDitahanPct: number
    operasionalAccountName: string | null
    direksiAccountName: string | null
    bonusAccountName: string | null
    hppReserveAccountName: string | null
    labaDitahanAccountName: string | null
    transferFee: number
    defaultFeeApplies: Record<BucketKey, boolean>
  }
}

type BucketKey = "Operasional" | "Direksi" | "Bonus" | "Cadangan Modal/HPP" | "Laba Ditahan/Dana Darurat"
const BUCKET_KEYS: BucketKey[] = ["Operasional", "Direksi", "Cadangan Modal/HPP", "Bonus", "Laba Ditahan/Dana Darurat"]

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

const STATUS_BADGE: Record<SlottingOmsetDetailProps["slot"]["status"], { label: string; variant: "warning" | "success" | "secondary" }> = {
  draft: { label: "Belum Split", variant: "warning" },
  processed: { label: "Sudah Split", variant: "success" },
  skipped: { label: "Tidak Split", variant: "secondary" },
}

export const SlottingOmsetDetail: React.FC<SlottingOmsetDetailProps> = ({ isOwner, slot: initialSlot, settingsPreview }) => {
  const router = useRouter()
  const [slot, setSlot] = useState(initialSlot)
  const [costLines, setCostLines] = useState(initialSlot.costLines)
  const [newDescription, setNewDescription] = useState("")
  const [newAmount, setNewAmount] = useState(0)
  const [isAddingLine, setIsAddingLine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [error, setError] = useState("")
  const [feeOverrides, setFeeOverrides] = useState<Record<BucketKey, boolean>>(settingsPreview.defaultFeeApplies)
  const [confirmProcessOpen, setConfirmProcessOpen] = useState(false)
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false)

  const totalCost = slot.initialCostAmount + costLines.reduce((s, l) => s + l.amount, 0)
  const netAmount = slot.status === "draft" ? slot.grossAmount - totalCost : (slot.netAmount ?? 0)

  const preview =
    slot.status === "draft"
      ? {
          operasional: Math.round((netAmount * settingsPreview.operasionalPct) / 100),
          direksi: Math.round((netAmount * settingsPreview.direksiPct) / 100),
          bonus: Math.round((netAmount * settingsPreview.bonusPct) / 100),
          hppReserve: Math.round((netAmount * settingsPreview.hppReservePct) / 100),
          labaDitahan: Math.round((netAmount * settingsPreview.labaDitahanPct) / 100),
        }
      : {
          operasional: slot.operasionalAmount ?? 0,
          direksi: slot.direksiAmount ?? 0,
          bonus: slot.bonusAmount ?? 0,
          hppReserve: slot.hppReserveAmount ?? 0,
          labaDitahan: slot.labaDitahanAmount ?? 0,
        }

  const handleAddLine = async () => {
    if (!newDescription.trim() || newAmount <= 0) {
      setError("Deskripsi dan nominal biaya wajib diisi")
      return
    }
    setIsAddingLine(true)
    setError("")
    const res = await fetch(`/api/revenue-slots/${slot.id}/cost-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: newDescription, amount: newAmount }),
    })
    const data = await res.json()
    setIsAddingLine(false)
    if (!res.ok) {
      setError(data.error || "Gagal menambah biaya")
      return
    }
    setCostLines((prev) => [...prev, { id: data.id ?? crypto.randomUUID(), description: newDescription, amount: newAmount }])
    setNewDescription("")
    setNewAmount(0)
    router.refresh()
  }

  const handleRemoveLine = async (lineId: string) => {
    setError("")
    const res = await fetch(`/api/revenue-slots/${slot.id}/cost-lines/${lineId}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error || "Gagal menghapus biaya")
      return
    }
    setCostLines((prev) => prev.filter((l) => l.id !== lineId))
    router.refresh()
  }

  const handleProcess = async () => {
    setConfirmProcessOpen(false)
    setIsProcessing(true)
    setError("")
    const res = await fetch(`/api/revenue-slots/${slot.id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeOverrides }),
    })
    const data = await res.json()
    setIsProcessing(false)
    if (!res.ok) {
      setError(data.error || "Gagal proses Slotting Omset")
      return
    }
    router.refresh()
    setSlot((prev) => ({
      ...prev,
      status: "processed",
      netAmount: data.netAmount,
      operasionalAmount: data.operasionalAmount,
      direksiAmount: data.direksiAmount,
      bonusAmount: data.bonusAmount,
      hppReserveAmount: data.hppReserveAmount,
      labaDitahanAmount: data.labaDitahanAmount,
      transferFeeTotal: data.transferFeeTotal,
    }))
  }

  const handleSkip = async () => {
    setConfirmSkipOpen(false)
    setIsSkipping(true)
    setError("")
    const res = await fetch(`/api/revenue-slots/${slot.id}/skip`, { method: "POST" })
    const data = await res.json()
    setIsSkipping(false)
    if (!res.ok) {
      setError(data.error || "Gagal menandai")
      return
    }
    setSlot((prev) => ({ ...prev, status: "skipped" }))
  }

  const badge = STATUS_BADGE[slot.status]

  return (
    <>
      <div className="flex items-center justify-between">
        <Link href={`/pembayaran/${slot.payment.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Kembali ke Pembayaran
        </Link>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Slotting Omset — {slot.payment.paymentNumber}</CardTitle>
          <CardDescription>{slot.payment.clientName} · Masuk ke {slot.payment.accountName}</CardDescription>
        </CardHeader>

        {error && (
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Uang Masuk</span>
            <span className="font-semibold text-slate-900">{formatRupiah(slot.grossAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Biaya sudah diinput (saat pembayaran)</span>
            <span className="font-semibold text-rose-700">-{formatRupiah(slot.initialCostAmount)}</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200/60">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Apakah ada biaya lagi?</p>
          {costLines.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {costLines.map((l) => (
                <div key={l.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 text-sm">
                  <span className="text-slate-700">{l.description}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-rose-700">-{formatRupiah(l.amount)}</span>
                    {slot.status === "draft" && isOwner && (
                      <button onClick={() => handleRemoveLine(l.id)} className="text-slate-400 hover:text-rose-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {slot.status === "draft" && isOwner && (
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2 items-end">
              <Input label="Deskripsi biaya" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="mis. Biaya tak terduga" />
              <CurrencyInput label="Nominal" value={newAmount} onChange={setNewAmount} />
              <Button variant="outline" size="sm" onClick={handleAddLine} isLoading={isAddingLine} leftIcon={<Plus className="w-4 h-4" />}>
                Tambah Baris
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t-2 border-slate-300 flex justify-between items-center">
          <span className="font-black text-slate-900">Laba Bersih</span>
          <span className="font-black text-lg text-slate-900">{formatRupiah(netAmount)}</span>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200/60 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-slate-500 uppercase">{slot.status === "draft" ? "Preview Pembagian" : "Pembagian"}</p>
            {slot.status === "draft" && <p className="text-xs font-bold text-slate-500 uppercase">Biaya Admin</p>}
          </div>
          <SplitRow
            label="Operasional"
            pct={settingsPreview.operasionalPct}
            amount={preview.operasional}
            accountName={settingsPreview.operasionalAccountName}
            showFeeCheckbox={slot.status === "draft" && isOwner}
            feeChecked={feeOverrides.Operasional}
            onFeeChange={(checked) => setFeeOverrides((prev) => ({ ...prev, Operasional: checked }))}
          />
          <SplitRow
            label="Direksi"
            pct={settingsPreview.direksiPct}
            amount={preview.direksi}
            accountName={settingsPreview.direksiAccountName}
            showFeeCheckbox={slot.status === "draft" && isOwner}
            feeChecked={feeOverrides.Direksi}
            onFeeChange={(checked) => setFeeOverrides((prev) => ({ ...prev, Direksi: checked }))}
          />
          <SplitRow
            label="Cadangan Modal/HPP"
            pct={settingsPreview.hppReservePct}
            amount={preview.hppReserve}
            accountName={settingsPreview.hppReserveAccountName}
            showFeeCheckbox={slot.status === "draft" && isOwner}
            feeChecked={feeOverrides["Cadangan Modal/HPP"]}
            onFeeChange={(checked) => setFeeOverrides((prev) => ({ ...prev, "Cadangan Modal/HPP": checked }))}
          />
          <SplitRow
            label="Bonus"
            pct={settingsPreview.bonusPct}
            amount={preview.bonus}
            accountName={settingsPreview.bonusAccountName}
            showFeeCheckbox={slot.status === "draft" && isOwner}
            feeChecked={feeOverrides.Bonus}
            onFeeChange={(checked) => setFeeOverrides((prev) => ({ ...prev, Bonus: checked }))}
          />
          <SplitRow
            label="Laba Ditahan/Dana Darurat"
            pct={settingsPreview.labaDitahanPct}
            amount={preview.labaDitahan}
            accountName={settingsPreview.labaDitahanAccountName}
            showFeeCheckbox={slot.status === "draft" && isOwner}
            feeChecked={feeOverrides["Laba Ditahan/Dana Darurat"]}
            onFeeChange={(checked) => setFeeOverrides((prev) => ({ ...prev, "Laba Ditahan/Dana Darurat": checked }))}
          />
          {slot.status === "draft" && (
            <p className="text-xs text-slate-500 pt-1">
              Biaya admin (Rp{settingsPreview.transferFee.toLocaleString("id-ID")}) otomatis dipotong dari nominal transfer kalau dicentang.
            </p>
          )}
        </div>

        {slot.status === "processed" && slot.transfers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200/60">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Pindah Buku yang dibuat</p>
            <div className="space-y-1.5">
              {slot.transfers.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 text-sm">
                  <span className="text-slate-700">&rarr; {t.destinationAccountName}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">{formatRupiah(t.amount)}</span>
                    {t.journalEntryId && (
                      <Link href={`/akuntansi/jurnal?entryId=${t.journalEntryId}`} className="text-xs font-bold text-blue-700 hover:underline">
                        Lihat Jurnal
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {slot.transferFeeTotal != null && slot.transferFeeTotal > 0 && (
              <p className="text-xs text-slate-500 mt-2">Total biaya admin transfer: {formatRupiah(slot.transferFeeTotal)}</p>
            )}
          </div>
        )}

        {slot.status === "draft" && isOwner && (
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setConfirmSkipOpen(true)} isLoading={isSkipping}>
              Tidak Split
            </Button>
            <Button variant="primary" onClick={() => setConfirmProcessOpen(true)} isLoading={isProcessing} disabled={netAmount <= 0}>
              Proses
            </Button>
          </div>
        )}
      </Card>

      <Modal isOpen={confirmProcessOpen} onClose={() => setConfirmProcessOpen(false)} title="Proses Slotting Omset?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Slotting Omset <span className="font-bold text-slate-800">{slot.payment.paymentNumber}</span> — Laba Bersih{" "}
            <span className="font-bold text-slate-800">{formatRupiah(netAmount)}</span> akan dipindah ke 5 rekening tujuan.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmProcessOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleProcess} isLoading={isProcessing}>
              Ya, Proses
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={confirmSkipOpen} onClose={() => setConfirmSkipOpen(false)} title="Tandai Tidak Di-split?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">Tidak ada Pindah Buku yang akan dibuat untuk Slotting Omset ini.</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmSkipOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleSkip} isLoading={isSkipping}>
              Ya, Tidak Split
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function SplitRow({
  label,
  pct,
  amount,
  accountName,
  showFeeCheckbox,
  feeChecked,
  onFeeChange,
}: {
  label: string
  pct: number
  amount: number
  accountName: string | null
  showFeeCheckbox?: boolean
  feeChecked?: boolean
  onFeeChange?: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">
        {label} ({pct}%) {accountName ? <span className="text-slate-400">&middot; {accountName}</span> : <span className="text-rose-500">&middot; akun belum di-set</span>}
      </span>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-900">{formatRupiah(amount)}</span>
        {showFeeCheckbox && (
          <input
            type="checkbox"
            checked={feeChecked}
            onChange={(e) => onFeeChange?.(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
            title="Biaya admin transfer antar bank"
          />
        )}
      </div>
    </div>
  )
}
