"use client"

import Link from "next/link"

import {
  Badge,
  Button,
  Card,
  ColumnVisibilityMenu,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { useColumnVisibility, type ColumnDef } from "@/lib/use-column-visibility"
import { OutcomeBadge, PriorityPinBadge, STAGE_LABEL, tempBadgeVariant } from "./ui"

export interface LeadReportRow {
  id: string
  masukAt: string
  nama: string
  perusahaan: string | null
  whatsappNumber: string
  sales: string | null
  chatPertamaAt: string | null
  dibalasAt: string | null
  responseMinutes: number | null
  jadwalFuAt: string | null
  jadwalFuPurpose: string | null
  jadwalFuSales: string | null
  catatan: string | null
  catatanAt: string | null
  catatanOleh: string | null
  aktivitasTerakhir: string | null
  aktivitasTerakhirAt: string | null
  aktivitasTerakhirNote: string | null
  aktivitasTerakhirOleh: string | null
  hasilFuTerakhir: string | null
  hasilFuTerakhirAt: string | null
  hasilFuTerakhirNote: string | null
  hasilFuTepatWaktu: boolean | null
  segmen: string | null
  sumber: string | null
  temperature: string
  stage: string
  priorityScore: number
  priorityPinnedAt: string | null
  priorityPinNote: string | null
  outcome: string
  lostReason: string | null
  dealValue: number | null
  umurHari: number
}

/** Kolom tabel = kolom export CSV, urutan & label sama persis — supaya yang dilihat di layar dan
 *  yang keluar di Excel tidak pernah beda isi. Semua tampil secara default; yang tidak dipakai
 *  disembunyikan lewat menu "Kolom" (pilihannya diingat per browser, lihat useColumnVisibility). */
const COLUMNS: ColumnDef[] = [
  { key: "masuk", label: "Tanggal & Jam Masuk" },
  { key: "nama", label: "Nama" },
  { key: "perusahaan", label: "Perusahaan" },
  { key: "wa", label: "No WA" },
  { key: "sales", label: "Sales" },
  { key: "chatPertama", label: "Chat Pertama Masuk" },
  { key: "dibalas", label: "Dibalas" },
  { key: "response", label: "Response Time" },
  { key: "jadwalFu", label: "Jadwal FU" },
  { key: "tujuanFu", label: "Tujuan FU" },
  { key: "fuUntuk", label: "FU Untuk" },
  { key: "catatan", label: "Catatan" },
  { key: "catatanAt", label: "Tanggal Catatan" },
  { key: "catatanOleh", label: "Penulis Catatan" },
  { key: "aktivitas", label: "Aktivitas Terakhir" },
  { key: "aktivitasAt", label: "Tanggal Aktivitas" },
  { key: "aktivitasNote", label: "Catatan Aktivitas" },
  { key: "aktivitasOleh", label: "Pelaku Aktivitas" },
  { key: "hasilFu", label: "Hasil FU Terakhir" },
  { key: "hasilFuAt", label: "Tanggal Hasil FU" },
  { key: "hasilFuNote", label: "Catatan Hasil FU" },
  { key: "segmen", label: "Segmen" },
  { key: "sumber", label: "Sumber" },
  { key: "temperature", label: "Temperatur" },
  { key: "stage", label: "Tahap" },
  { key: "skor", label: "Skor Prioritas" },
  { key: "prioritasSpv", label: "Prioritas SPV" },
  { key: "status", label: "Status" },
  { key: "alasanLost", label: "Alasan Lost" },
  { key: "nilaiDeal", label: "Nilai Deal" },
  { key: "umur", label: "Umur (hari)" },
]

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" })
}

/** Response time ditampilkan dalam satuan yang paling gampang dibaca per besarannya — "1j 20m"
 *  lebih cepat ditangkap daripada "80 menit", dan yang lewat sehari kerja langsung kelihatan. */
function fmtResponse(minutes: number | null) {
  if (minutes == null) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 9) return m ? `${h}j ${m}m` : `${h}j`
  // 9 jam dipakai sebagai patokan "1 hari kerja" biar angka besar tetap kebayang panjangnya.
  const d = Math.floor(h / 9)
  const sisaJam = h % 9
  return sisaJam ? `${d} hari ${sisaJam}j` : `${d} hari kerja`
}

/** Warna response time = SLA kasar: ≤15 menit hijau, ≤1 jam kuning, lebih dari itu merah.
 *  Semuanya dalam jam kerja, jadi chat yang masuk tengah malam tidak ikut dihukum. */
function responseColor(minutes: number | null) {
  if (minutes == null) return "text-slate-400"
  if (minutes <= 15) return "text-emerald-600"
  if (minutes <= 60) return "text-amber-600"
  return "text-rose-600"
}

const Dash = () => <span className="text-slate-300">—</span>

/** Teks panjang (catatan, tujuan FU) dipotong 1 baris + judul lengkap di hover — kalau dibiarkan
 *  penuh, satu sel bisa setinggi 5 baris dan seluruh tabel jadi susah dipindai. */
const Trunc: React.FC<{ text: string | null; width?: string }> = ({ text, width = "max-w-[220px]" }) =>
  text ? (
    <span className={`block truncate ${width}`} title={text}>
      {text}
    </span>
  ) : (
    <Dash />
  )

export const LeadReportTab: React.FC<{
  rows: LeadReportRow[]
  total: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}> = ({ rows, total, hasMore, loadingMore, onLoadMore }) => {
  const { isVisible, toggle } = useColumnVisibility("marketing-laporan-lead", COLUMNS)

  const terbalas = rows.filter((r) => r.responseMinutes != null)
  const avgResponse = terbalas.length
    ? Math.round(terbalas.reduce((s, r) => s + (r.responseMinutes ?? 0), 0) / terbalas.length)
    : null
  const belumDibalas = rows.filter((r) => r.chatPertamaAt && !r.dibalasAt).length

  const cell: Record<string, (r: LeadReportRow) => React.ReactNode> = {
    masuk: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.masukAt)}</span>,
    nama: (r) => (
      <div className="flex items-center gap-1.5">
        <Link href={`/marketing/leads/${r.id}`} className="font-bold text-slate-800 hover:text-blue-700 whitespace-nowrap">
          {r.nama}
        </Link>
        <PriorityPinBadge pinnedAt={r.priorityPinnedAt} note={r.priorityPinNote} compact />
      </div>
    ),
    perusahaan: (r) => <Trunc text={r.perusahaan} width="max-w-[180px]" />,
    wa: (r) => <span className="whitespace-nowrap">{r.whatsappNumber}</span>,
    sales: (r) => (r.sales ? <span className="whitespace-nowrap">{r.sales}</span> : <span className="text-rose-500 whitespace-nowrap">belum ada PIC</span>),
    chatPertama: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.chatPertamaAt)}</span>,
    dibalas: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.dibalasAt)}</span>,
    response: (r) =>
      r.responseMinutes != null ? (
        <span className={`font-bold whitespace-nowrap ${responseColor(r.responseMinutes)}`}>{fmtResponse(r.responseMinutes)}</span>
      ) : r.chatPertamaAt ? (
        <span className="font-bold text-rose-600 whitespace-nowrap">belum dibalas</span>
      ) : (
        <span className="text-slate-400 whitespace-nowrap">tanpa chat</span>
      ),
    jadwalFu: (r) => <span className="whitespace-nowrap">{fmtDate(r.jadwalFuAt)}</span>,
    tujuanFu: (r) => <Trunc text={r.jadwalFuPurpose} />,
    fuUntuk: (r) => (r.jadwalFuSales ? <span className="whitespace-nowrap">{r.jadwalFuSales}</span> : <Dash />),
    catatan: (r) => <Trunc text={r.catatan} width="max-w-[260px]" />,
    // catatanAt kosong = isinya jatuh balik ke catatan singkat lead yang memang tidak bertimestamp.
    catatanAt: (r) => (r.catatanAt ? <span className="whitespace-nowrap">{fmtDateTime(r.catatanAt)}</span> : <Dash />),
    catatanOleh: (r) => (r.catatanOleh ? <span className="whitespace-nowrap">{r.catatanOleh}</span> : <Dash />),
    aktivitas: (r) => (r.aktivitasTerakhir ? <span className="whitespace-nowrap">{r.aktivitasTerakhir}</span> : <Dash />),
    aktivitasAt: (r) => <span className="whitespace-nowrap">{fmtDate(r.aktivitasTerakhirAt)}</span>,
    aktivitasNote: (r) => <Trunc text={r.aktivitasTerakhirNote} />,
    aktivitasOleh: (r) => (r.aktivitasTerakhirOleh ? <span className="whitespace-nowrap">{r.aktivitasTerakhirOleh}</span> : <Dash />),
    hasilFu: (r) =>
      r.hasilFuTerakhir ? (
        <span className="whitespace-nowrap">
          {r.hasilFuTerakhir}
          {r.hasilFuTepatWaktu === false ? <span className="text-amber-600 font-bold"> (telat)</span> : null}
        </span>
      ) : (
        <Dash />
      ),
    hasilFuAt: (r) => <span className="whitespace-nowrap">{fmtDate(r.hasilFuTerakhirAt)}</span>,
    hasilFuNote: (r) => <Trunc text={r.hasilFuTerakhirNote} />,
    segmen: (r) => (r.segmen ? <span className="whitespace-nowrap">{r.segmen}</span> : <Dash />),
    sumber: (r) => (r.sumber ? <span className="whitespace-nowrap">{r.sumber}</span> : <Dash />),
    temperature: (r) => (
      <Badge variant={tempBadgeVariant(r.temperature)} size="sm">
        {r.temperature}
      </Badge>
    ),
    stage: (r) => <span className="whitespace-nowrap">{STAGE_LABEL[r.stage] ?? r.stage}</span>,
    skor: (r) => <span className="font-bold">{r.priorityScore}</span>,
    prioritasSpv: (r) => (r.priorityPinnedAt ? <Trunc text={r.priorityPinNote || "Ya"} width="max-w-[180px]" /> : <Dash />),
    // OutcomeBadge sengaja tidak nge-badge OPEN (lihat ui.tsx) — di laporan kolomnya tidak boleh
    // kosong, jadi OPEN ditulis sebagai teks biasa.
    status: (r) =>
      r.outcome === "OPEN" ? <span className="text-slate-500">Open</span> : <OutcomeBadge outcome={r.outcome} lostReason={null} />,
    alasanLost: (r) => <Trunc text={r.lostReason} width="max-w-[180px]" />,
    nilaiDeal: (r) =>
      r.dealValue ? (
        <span className="font-bold text-emerald-700 whitespace-nowrap">Rp{r.dealValue.toLocaleString("id-ID")}</span>
      ) : (
        <Dash />
      ),
    umur: (r) => <span className="whitespace-nowrap">{r.umurHari} hari</span>,
  }

  const shown = COLUMNS.filter((c) => isVisible(c.key))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap text-xs font-bold text-slate-500">
          <span>
            Menampilkan <span className="text-slate-800">{rows.length}</span> dari{" "}
            <span className="text-slate-800">{total}</span> lead
          </span>
          {avgResponse != null && (
            <span>
              Rata-rata balasan pertama: <span className={responseColor(avgResponse)}>{fmtResponse(avgResponse)}</span>
            </span>
          )}
          {belumDibalas > 0 && <span className="text-rose-600">{belumDibalas} lead belum pernah dibalas</span>}
        </div>
        <ColumnVisibilityMenu columns={COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>

      {rows.length === 0 ? (
        <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
          Tidak ada lead pada rentang tanggal ini.
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                {shown.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  {shown.map((c) => (
                    <TableCell key={c.key} className="text-slate-600 align-top">
                      {cell[c.key](r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {hasMore && (
        <Button variant="secondary" fullWidth isLoading={loadingMore} onClick={onLoadMore}>
          Muat lebih banyak ({rows.length}/{total})
        </Button>
      )}
    </div>
  )
}
