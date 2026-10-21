"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Pencil, Plus, X } from "lucide-react"

import {
  Alert,
  Button,
  Card,
  CurrencyInput,
  Input,
  Modal,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ui"

export interface KategoriLevelRow {
  id: string
  categoryName: string
  levelName: string
  description: string | null
  price: number
  /** Berapa baris transaksi pekerjaan yang sudah memakai level ini. */
  usedCount: number
}

export interface PricelistKandidat {
  id: string
  label: string
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

/**
 * Pengelolaan daftar kategori & level pekerjaan Blesscom (menu Blesscom -> Kategori & Level
 * Pekerjaan) — inilah daftar yang ditawarkan di form Daftar Pekerjaan dan dipakai AI di
 * "Saran Perhitungan"/Pengajuan Pekerjaan.
 *
 * Barisnya WorkPriceItem yang `blesscomPrice`-nya terisi. Level yang sudah ada di pricelist umum
 * tapi belum punya harga Blesscom ditawarkan lewat "Ambil dari Pricelist" supaya tidak lahir
 * baris kembar; mengeluarkan level cuma mengosongkan harga Blesscom-nya, barisnya tetap ada di
 * pricelist umum.
 */
export const KategoriLevelPanel: React.FC<{
  rows: KategoriLevelRow[]
  kandidat: PricelistKandidat[]
  canEdit: boolean
}> = ({ rows, kandidat, canEdit }) => {
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tambahOpen, setTambahOpen] = useState(false)
  const [draftCategory, setDraftCategory] = useState("")
  const [draftLevel, setDraftLevel] = useState("")
  const [draftDesc, setDraftDesc] = useState("")
  const [draftPrice, setDraftPrice] = useState(0)

  const [ambilOpen, setAmbilOpen] = useState(false)
  const [ambilId, setAmbilId] = useState("")
  const [ambilPrice, setAmbilPrice] = useState(0)

  const [editRow, setEditRow] = useState<KategoriLevelRow | null>(null)
  const [keluarRow, setKeluarRow] = useState<KategoriLevelRow | null>(null)

  const categoryOptions = useMemo(
    () => [...new Set(rows.map((r) => r.categoryName))].map((n) => ({ value: n, label: n })),
    [rows],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, KategoriLevelRow[]>()
    for (const r of rows) map.set(r.categoryName, [...(map.get(r.categoryName) ?? []), r])
    return [...map.entries()]
  }, [rows])

  const kirim = async (url: string, init: RequestInit, onBeres: () => void) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, init)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || "Gagal menyimpan")
        return
      }
      onBeres()
      router.refresh()
    } catch {
      setError("Gagal menghubungi server")
    } finally {
      setBusy(false)
    }
  }

  const tambah = () =>
    kirim(
      "/api/blesscom/kategori-level",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryName: draftCategory,
          levelName: draftLevel,
          description: draftDesc,
          price: draftPrice,
        }),
      },
      () => {
        setTambahOpen(false)
        setDraftCategory("")
        setDraftLevel("")
        setDraftDesc("")
        setDraftPrice(0)
      },
    )

  const ambil = () =>
    kirim(
      `/api/blesscom/kategori-level/${ambilId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price: ambilPrice }) },
      () => {
        setAmbilOpen(false)
        setAmbilId("")
        setAmbilPrice(0)
      },
    )

  const simpanEdit = () => {
    if (!editRow) return
    kirim(
      `/api/blesscom/kategori-level/${editRow.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryName: editRow.categoryName,
          levelName: editRow.levelName,
          description: editRow.description,
          price: editRow.price,
        }),
      },
      () => setEditRow(null),
    )
  }

  const keluarkan = () => {
    if (!keluarRow) return
    kirim(`/api/blesscom/kategori-level/${keluarRow.id}`, { method: "DELETE" }, () => setKeluarRow(null))
  }

  return (
    <div className="space-y-5">
      <Card padding="md" variant="feature">
        <p className="text-sm font-semibold text-slate-700">Daftar harga khusus client Blesscom</p>
        <p className="text-xs text-slate-500 mt-1">
          Acuannya <strong>murni kategori &amp; level</strong>, bukan bobot — angkanya sudah jadi kesepakatan dengan
          client, jadi tidak ikut berubah saat rubrik bobot di Acuan Level dikalibrasi ulang. Daftar inilah yang dipakai{" "}
          <strong>Daftar Pekerjaan</strong>, <strong>Saran Perhitungan</strong>, dan{" "}
          <strong>Pengajuan Pekerjaan</strong>. Harga <strong>Rp 0</strong> berarti levelnya ada tapi harganya belum
          disepakati — nominalnya harus diisi tangan saat dipakai.
        </p>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setTambahOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Level
          </Button>
          {kandidat.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAmbilOpen(true)}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Ambil dari Pricelist ({kandidat.length})
            </Button>
          )}
        </div>
      )}

      {rows.length === 0 && <Alert variant="warning">Belum ada kategori &amp; level di daftar Blesscom.</Alert>}

      {grouped.map(([categoryName, groupRows]) => (
        <div key={categoryName}>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">{categoryName}</h3>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="whitespace-nowrap">Harga Blesscom</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Dipakai</TableHead>
                  {canEdit && <TableHead className="w-24">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold whitespace-nowrap">{row.levelName}</TableCell>
                    <TableCell className="max-w-md text-slate-600">{row.description ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.price === 0 ? (
                        <span className="text-amber-600 font-semibold">Belum ada harga</span>
                      ) : (
                        <span className="font-semibold">{formatRupiah(row.price)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-slate-600">
                      {row.usedCount > 0 ? `${row.usedCount}×` : "-"}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditRow(row)} aria-label="Ubah">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setKeluarRow(row)}
                            aria-label="Keluarkan dari daftar"
                            className="text-rose-600"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      ))}

      <Modal
        isOpen={tambahOpen}
        onClose={() => setTambahOpen(false)}
        title="Tambah Level Blesscom"
        subtitle="Kategori boleh yang sudah ada atau nama baru"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setTambahOpen(false)}>
              Batal
            </Button>
            <Button onClick={tambah} isLoading={busy} disabled={!draftCategory.trim() || !draftLevel.trim()}>
              Tambah
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Select
            label="Kategori"
            options={categoryOptions}
            value={draftCategory}
            onChange={setDraftCategory}
            placeholder="Pilih atau tulis kategori baru"
            searchable
            searchPlaceholder="Cari / tulis kategori..."
            creatable
            onCreateOption={async (q) => {
              const nama = q.trim()
              setDraftCategory(nama)
              return { value: nama, label: nama }
            }}
            createOptionLabel={(q) => `Kategori baru "${q}"`}
          />
          <Input
            label="Nama Level"
            placeholder="mis. LEV-4"
            value={draftLevel}
            onChange={(e) => setDraftLevel(e.target.value)}
          />
          <Textarea
            label="Keterangan (opsional)"
            rows={2}
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
          />
          <CurrencyInput
            label="Harga Blesscom"
            value={draftPrice}
            onChange={setDraftPrice}
            helperText="Kosongkan (Rp 0) kalau harganya belum disepakati."
          />
        </div>
      </Modal>

      <Modal
        isOpen={ambilOpen}
        onClose={() => setAmbilOpen(false)}
        title="Ambil dari Pricelist Umum"
        subtitle="Level yang sudah ada di pricelist tapi belum punya harga Blesscom"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAmbilOpen(false)}>
              Batal
            </Button>
            <Button onClick={ambil} isLoading={busy} disabled={!ambilId}>
              Masukkan
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Select
            label="Level"
            options={kandidat.map((k) => ({ value: k.id, label: k.label }))}
            value={ambilId}
            onChange={setAmbilId}
            placeholder="Pilih level"
            searchable
            searchPlaceholder="Cari level..."
          />
          <CurrencyInput label="Harga Blesscom" value={ambilPrice} onChange={setAmbilPrice} />
          <p className="text-xs text-slate-500">
            Harga umum (turunan rubrik bobot) tidak disentuh — yang diisi di sini cuma harga kesepakatan Blesscom.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={editRow !== null}
        onClose={() => setEditRow(null)}
        title="Ubah Level Blesscom"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditRow(null)}>
              Batal
            </Button>
            <Button onClick={simpanEdit} isLoading={busy}>
              Simpan
            </Button>
          </div>
        }
      >
        {editRow && (
          <div className="space-y-3">
            <Input
              label="Kategori"
              value={editRow.categoryName}
              onChange={(e) => setEditRow({ ...editRow, categoryName: e.target.value })}
            />
            <Input
              label="Nama Level"
              value={editRow.levelName}
              onChange={(e) => setEditRow({ ...editRow, levelName: e.target.value })}
            />
            <Textarea
              label="Keterangan (opsional)"
              rows={2}
              value={editRow.description ?? ""}
              onChange={(e) => setEditRow({ ...editRow, description: e.target.value })}
            />
            <CurrencyInput
              label="Harga Blesscom"
              value={editRow.price}
              onChange={(v) => setEditRow({ ...editRow, price: v })}
            />
            {editRow.usedCount > 0 && (
              <Alert variant="info">
                Level ini sudah dipakai {editRow.usedCount} baris pekerjaan. Transaksi lama TIDAK ikut berubah — nominal
                &amp; nama levelnya sudah disnapshot saat diinput.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={keluarRow !== null}
        onClose={() => setKeluarRow(null)}
        title="Keluarkan dari daftar Blesscom?"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setKeluarRow(null)}>
              Batal
            </Button>
            <Button variant="danger" onClick={keluarkan} isLoading={busy}>
              Keluarkan
            </Button>
          </div>
        }
      >
        {keluarRow && (
          <p className="text-sm text-slate-600">
            <strong>
              {keluarRow.categoryName} — {keluarRow.levelName}
            </strong>{" "}
            berhenti ditawarkan di menu Blesscom. Barisnya tetap ada di pricelist umum (menu Acuan Level) dan transaksi
            lama tidak berubah, jadi bisa dimasukkan lagi kapan saja dengan mengisi harganya ulang.
          </p>
        )}
      </Modal>
    </div>
  )
}
