"use client"

import Link from "next/link"

import {
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
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
  // 9 jam = 1 hari kerja penuh (lihat working-hours.ts) — di atas itu dihitung per hari kerja.
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

const Cell: React.FC<{ title: string; sub?: string | null; className?: string }> = ({ title, sub, className = "" }) => (
  <div className={className}>
    <p className="text-slate-700">{title}</p>
    {sub ? <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{sub}</p> : null}
  </div>
)

export const LeadReportTab: React.FC<{
  rows: LeadReportRow[]
  total: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}> = ({ rows, total, hasMore, loadingMore, onLoadMore }) => {
  const terbalas = rows.filter((r) => r.responseMinutes != null)
  const avgResponse = terbalas.length
    ? Math.round(terbalas.reduce((s, r) => s + (r.responseMinutes ?? 0), 0) / terbalas.length)
    : null
  const belumDibalas = rows.filter((r) => r.chatPertamaAt && !r.dibalasAt).length

  if (rows.length === 0) {
    return (
      <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
        Tidak ada lead pada rentang tanggal ini.
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
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

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Masuk</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>No WA</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Response</TableHead>
              <TableHead>Jadwal FU</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead>Tindak Lanjut</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-slate-600">
                  <Cell title={fmtDateTime(r.masukAt)} sub={`${r.umurHari} hari lalu`} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/marketing/leads/${r.id}`} className="font-bold text-slate-800 hover:text-blue-700">
                      {r.nama}
                    </Link>
                    <PriorityPinBadge pinnedAt={r.priorityPinnedAt} note={r.priorityPinNote} compact />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant={tempBadgeVariant(r.temperature)} size="sm">{r.temperature}</Badge>
                    <span className="text-[11px] text-slate-400 truncate max-w-[160px]">
                      {[r.perusahaan, r.segmen, STAGE_LABEL[r.stage] !== "—" ? STAGE_LABEL[r.stage] : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-slate-600">{r.whatsappNumber}</TableCell>
                <TableCell className="text-slate-600">{r.sales ?? <span className="text-rose-500">belum ada PIC</span>}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.responseMinutes != null ? (
                    <>
                      <p className={`font-bold ${responseColor(r.responseMinutes)}`}>{fmtResponse(r.responseMinutes)}</p>
                      <p className="text-[11px] text-slate-400">dibalas {fmtDateTime(r.dibalasAt)}</p>
                    </>
                  ) : r.chatPertamaAt ? (
                    <span className="font-bold text-rose-600">belum dibalas</span>
                  ) : (
                    <span className="text-slate-400">tanpa chat</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-slate-600">
                  {r.jadwalFuAt ? (
                    <Cell
                      title={fmtDate(r.jadwalFuAt)}
                      sub={[r.jadwalFuPurpose, r.jadwalFuSales].filter(Boolean).join(" · ")}
                    />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-600 max-w-[240px]">
                  {r.catatan ? (
                    <>
                      <p className="truncate" title={r.catatan}>{r.catatan}</p>
                      <p className="text-[11px] text-slate-400">
                        {r.catatanAt ? fmtDateTime(r.catatanAt) : "catatan lead"}
                        {r.catatanOleh ? ` · ${r.catatanOleh}` : ""}
                      </p>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-600 max-w-[240px]">
                  {r.aktivitasTerakhir || r.hasilFuTerakhir ? (
                    <>
                      {r.aktivitasTerakhir && (
                        <p className="truncate" title={r.aktivitasTerakhirNote ?? undefined}>
                          {r.aktivitasTerakhir}
                          <span className="text-[11px] text-slate-400"> · {fmtDate(r.aktivitasTerakhirAt)}</span>
                        </p>
                      )}
                      {r.hasilFuTerakhir && (
                        <p className="text-[11px] text-slate-400 truncate" title={r.hasilFuTerakhirNote ?? undefined}>
                          FU: {r.hasilFuTerakhir}
                          {r.hasilFuTepatWaktu === false ? " (telat)" : ""} · {fmtDate(r.hasilFuTerakhirAt)}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">belum ada</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <OutcomeBadge outcome={r.outcome} lostReason={r.lostReason} />
                  {r.outcome === "OPEN" && <span className="text-xs text-slate-400">Skor {r.priorityScore}</span>}
                  {r.dealValue ? (
                    <p className="text-[11px] font-bold text-emerald-700">
                      Rp{r.dealValue.toLocaleString("id-ID")}
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {hasMore && (
        <Button variant="secondary" fullWidth isLoading={loadingMore} onClick={onLoadMore}>
          Muat lebih banyak ({rows.length}/{total})
        </Button>
      )}
    </div>
  )
}
