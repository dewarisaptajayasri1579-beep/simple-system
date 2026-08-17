"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Modal, Card, CardDescription, Input, TableContainer, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui"
import { jakartaTodayDateIso } from "@/lib/datetime"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

interface MutasiRow {
  id: string
  journalEntryId: string
  date: string
  entryNumber: string
  description: string
  dk: "D" | "K"
  nominal: number
  saldo: number
}

interface MutasiData {
  account: { id: string; code: string; name: string }
  month: string
  saldoAwal: number
  totalDebit: number
  totalCredit: number
  saldoAkhir: number
  rows: MutasiRow[]
}

/** Versi modal dari halaman Buku Besar (src/app/akuntansi/buku-besar/page.tsx) — dibuka dari
 *  tombol "Mutasi" di baris akun berdaun (bukan parent) pada CoaList, tanpa pindah halaman.
 *  Data diambil dari GET /api/akuntansi/buku-besar yang menyalin persis logika saldo
 *  awal/mutasi/saldo akhir punya halaman aslinya. */
export const MutasiModal: React.FC<{ accountId: string; accountLabel: string; onClose: () => void }> = ({ accountId, accountLabel, onClose }) => {
  const [month, setMonth] = useState(jakartaTodayDateIso().slice(0, 7))
  const [data, setData] = useState<MutasiData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setIsLoading(true)
    setError("")
    fetch(`/api/akuntansi/buku-besar?accountId=${accountId}&month=${month}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body?.error || "Gagal memuat mutasi")
        setData(body)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat mutasi"))
      .finally(() => setIsLoading(false))
  }, [accountId, month])

  return (
    <Modal isOpen onClose={onClose} title={`Mutasi — ${accountLabel}`} size="xl">
      <div className="space-y-4">
        <Input label="Bulan" type="month" sizeVariant="sm" value={month} onChange={(e) => setMonth(e.target.value)} />

        {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Memuat...</p>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card variant="feature" padding="md">
                <CardDescription>Saldo Awal</CardDescription>
                <p className="text-base font-black text-slate-900 mt-1">{formatRupiah(data.saldoAwal)}</p>
              </Card>
              <Card variant="feature" padding="md">
                <CardDescription>Debet</CardDescription>
                <p className="text-base font-black text-slate-900 mt-1">{formatRupiah(data.totalDebit)}</p>
              </Card>
              <Card variant="feature" padding="md">
                <CardDescription>Kredit</CardDescription>
                <p className="text-base font-black text-slate-900 mt-1">{formatRupiah(data.totalCredit)}</p>
              </Card>
              <Card variant="feature" padding="md">
                <CardDescription>Saldo Akhir</CardDescription>
                <p className="text-base font-black text-slate-900 mt-1">{formatRupiah(data.saldoAkhir)}</p>
              </Card>
            </div>

            <TableContainer className="max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No. Bukti</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>D/K</TableHead>
                    <TableHead>Nominal</TableHead>
                    <TableHead>Saldo Akhir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-semibold text-slate-500">
                      Saldo Awal
                    </TableCell>
                    <TableCell className="font-bold">{formatRupiah(data.saldoAwal)}</TableCell>
                  </TableRow>
                  {data.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/akuntansi/jurnal?entryId=${r.journalEntryId}`} className="text-[#0544cc] hover:underline" onClick={onClose}>
                          {r.entryNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell className="font-bold">{r.dk}</TableCell>
                      <TableCell className="font-semibold">{formatRupiah(r.nominal)}</TableCell>
                      <TableCell className="font-semibold">{formatRupiah(r.saldo)}</TableCell>
                    </TableRow>
                  ))}
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                        Tidak ada mutasi di bulan ini.
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-black text-slate-700">
                      Saldo Akhir
                    </TableCell>
                    <TableCell className="font-black">{formatRupiah(data.saldoAkhir)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
