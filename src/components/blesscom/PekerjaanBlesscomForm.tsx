"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Sparkles, Trash2 } from "lucide-react"

import { SaranLevelDialog, type SaranLevelPick } from "@/components/blesscom/SaranLevelDialog"
import {
  Alert,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CurrencyInput,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui"
import { blesscomLevelName, type BlesscomLevelOption } from "@/lib/blesscom-work-level"

export interface PrincipleOption {
  value: string
  label: string
}

export interface DetailDraft {
  name: string
  workPriceItemId: string | null
  categoryName: string
  levelName: string
  amount: number
  /** Harga acuan level saat dipilih — dipakai buat penanda "diubah dari harga acuan". */
  refAmount: number | null
}

export interface PekerjaanFormInitial {
  id: string
  principleId: string
  /** "YYYY-MM-DD" */
  workDate: string
  notes: string
  items: DetailDraft[]
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
}

function emptyDetail(): DetailDraft {
  return { name: "", workPriceItemId: null, categoryName: "", levelName: "", amount: 0, refAmount: null }
}

/**
 * Form transaksi pekerjaan Blesscom — master (tanggal + principle) dan detail pekerjaannya
 * (pekerjaan, kategori, level, harga). Dipakai untuk "baru" maupun "edit"; bedanya cuma
 * ada/tidaknya `initial`.
 *
 * Kategori & level bisa dipilih sendiri dari pricelist Blesscom, atau ditentukan lewat
 * "Saran Perhitungan" (obrolan AI yang sama dengan menu Pengajuan Pekerjaan). Harga ikut terisi
 * dari harga level (`blesscomPrice`) tapi tetap bisa ditimpa — yang disimpan adalah angka di form
 * (snapshot), bukan harga live dari pricelist.
 */
export const PekerjaanBlesscomForm: React.FC<{
  principleOptions: PrincipleOption[]
  levelOptions: BlesscomLevelOption[]
  initial?: PekerjaanFormInitial
}> = ({ principleOptions, levelOptions, initial }) => {
  const router = useRouter()

  const [principleId, setPrincipleId] = useState(initial?.principleId ?? "")
  const [workDate, setWorkDate] = useState(initial?.workDate ?? todayWib())
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [items, setItems] = useState<DetailDraft[]>(initial?.items.length ? initial.items : [emptyDetail()])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** Index baris yang sedang minta saran AI — null = dialognya tertutup. */
  const [saranFor, setSaranFor] = useState<number | null>(null)

  const categoryOptions = useMemo(() => {
    const names = [...new Set(levelOptions.map((l) => l.groupName))]
    // Kategori dari transaksi lama yang levelnya sudah tidak ada di pricelist tetap ikut, supaya
    // isian lamanya tidak hilang dari dropdown saat diedit.
    for (const it of items) if (it.categoryName && !names.includes(it.categoryName)) names.push(it.categoryName)
    return names.map((n) => ({ value: n, label: n }))
  }, [levelOptions, items])

  const total = items.reduce((sum, it) => sum + it.amount, 0)

  const patchItem = (index: number, patch: Partial<DetailDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))

  /** Ganti kategori = level sebelumnya tidak berlaku lagi, jadi level & harganya dikosongkan. */
  const pickCategory = (index: number, categoryName: string) =>
    patchItem(index, { categoryName, levelName: "", workPriceItemId: null, amount: 0, refAmount: null })

  const pickLevel = (index: number, levelId: string) => {
    const level = levelOptions.find((l) => l.id === levelId)
    if (!level) return
    patchItem(index, {
      workPriceItemId: level.id,
      categoryName: level.groupName,
      levelName: blesscomLevelName(level),
      amount: level.price,
      refAmount: level.price,
    })
  }

  const applySaran = (index: number, pick: SaranLevelPick) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              // Nama pekerjaan yang sudah diisi staf tidak ditimpa — saran cuma mengisi yang kosong.
              name: it.name.trim() || pick.label,
              workPriceItemId: pick.itemId,
              categoryName: pick.groupName,
              levelName: pick.level ?? pick.label,
              amount: pick.price,
              refAmount: pick.price,
            }
          : it,
      ),
    )

  const addItem = () => setItems((prev) => [...prev, emptyDetail()])
  const removeItem = (index: number) => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(initial ? `/api/blesscom/pekerjaan/${initial.id}` : "/api/blesscom/pekerjaan", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ principleId, workDate, notes, items }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || "Gagal menyimpan transaksi")
        return
      }
      router.push("/blesscom/pekerjaan")
      router.refresh()
    } catch {
      setError("Gagal menghubungi server")
    } finally {
      setBusy(false)
    }
  }

  const hapus = async () => {
    if (!initial) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/blesscom/pekerjaan/${initial.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || "Gagal menghapus transaksi")
        return
      }
      router.push("/blesscom/pekerjaan")
      router.refresh()
    } catch {
      setError("Gagal menghubungi server")
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}

      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Data Transaksi</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Tanggal" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          <Select
            label="Principle"
            options={principleOptions}
            value={principleId}
            onChange={setPrincipleId}
            placeholder="Pilih principle"
            searchable
            searchPlaceholder="Cari principle..."
          />
        </div>
        <div className="mt-4">
          <Textarea label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </Card>

      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Detail Pekerjaan</CardTitle>
        </CardHeader>

        <div className="space-y-3">
          {items.map((item, index) => {
            const levelSelectOptions = levelOptions
              .filter((l) => l.groupName === item.categoryName)
              .map((l) => ({ value: l.id, label: `${blesscomLevelName(l)} · ${formatRupiah(l.price)}` }))

            return (
              <div key={index} className="p-4 rounded-2xl bg-white/60 border border-slate-200/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Pekerjaan {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-rose-500 hover:text-rose-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={items.length === 1}
                    aria-label="Hapus baris"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <Input
                  label="Pekerjaan"
                  placeholder="mis. Master Data Supplier"
                  value={item.name}
                  onChange={(e) => patchItem(index, { name: e.target.value })}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Select
                    label="Kategori"
                    options={categoryOptions}
                    value={item.categoryName}
                    onChange={(v) => pickCategory(index, v)}
                    placeholder="Pilih kategori"
                    searchable
                    searchPlaceholder="Cari kategori..."
                  />
                  <Select
                    label="Level"
                    options={levelSelectOptions}
                    value={item.workPriceItemId ?? ""}
                    onChange={(v) => pickLevel(index, v)}
                    placeholder={item.levelName || (item.categoryName ? "Pilih level" : "Pilih kategori dulu")}
                    disabled={!item.categoryName}
                    searchable
                    searchPlaceholder="Cari level..."
                  />
                  <CurrencyInput
                    label="Harga"
                    value={item.amount}
                    onChange={(v) => patchItem(index, { amount: v })}
                    helperText={
                      item.refAmount != null && item.amount !== item.refAmount
                        ? `Diubah dari harga acuan ${formatRupiah(item.refAmount)}`
                        : undefined
                    }
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSaranFor(index)}
                  leftIcon={<Sparkles className="w-4 h-4" />}
                >
                  Saran Perhitungan
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mt-3">
          <Button type="button" variant="secondary" size="sm" onClick={addItem} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Detail Pekerjaan
          </Button>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-200/80 flex items-center justify-between">
          <span className="text-sm font-black text-slate-700">Total</span>
          <span className="text-lg font-black text-emerald-700">{formatRupiah(total)}</span>
        </div>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        {initial ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            leftIcon={<Trash2 className="w-4 h-4" />}
            className="text-rose-600"
          >
            Hapus Transaksi
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => router.push("/blesscom/pekerjaan")}>
            Batal
          </Button>
          <Button type="button" onClick={submit} isLoading={busy} disabled={!principleId}>
            Simpan
          </Button>
        </div>
      </div>

      {saranFor !== null && (
        <SaranLevelDialog
          isOpen
          onClose={() => setSaranFor(null)}
          prefill={items[saranFor]?.name || undefined}
          onPick={(pick) => applySaran(saranFor, pick)}
        />
      )}

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus transaksi ini?"
        subtitle="Detail pekerjaannya ikut terhapus dan tidak bisa dikembalikan."
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={hapus} isLoading={busy}>
              Hapus
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Transaksi yang sudah ditagihkan tidak bisa dihapus dari sini — hapus invoice-nya dulu kalau memang salah input.
        </p>
      </Modal>
    </div>
  )
}
