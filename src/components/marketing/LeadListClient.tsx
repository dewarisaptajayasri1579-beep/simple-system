"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus, Search } from "lucide-react"

import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Pagination,
  Select,
  SkeletonList,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { useListScrollRestore } from "@/lib/use-list-scroll-restore"
import { PotentialButton } from "./PotentialButton"
import { DateRangeFilter, MktHeader, OutcomeBadge, PotentialBadge, PriorityPinBadge, ScopeToggle, STAGE_LABEL, tempBadgeVariant } from "./ui"
import type { DateRangePreset } from "@/lib/marketing/date-range"

interface LeadRow {
  id: string
  displayName: string
  companyName: string | null
  whatsappNumber: string
  temperature: string
  currentActivityStage: string
  priorityScore: number
  priorityLevel: string
  outcome: string
  lostReasonName: string | null
  priorityPinnedAt: string | null
  priorityPinNote: string | null
  priorityPinnedByName: string | null
  potentialAt: string | null
  potentialNote: string | null
  potentialByName: string | null
  segmentName: string | null
  buyingPowerTierName: string | null
  note: string | null
  pic: { id: string; name: string } | null
  lastInteractionAt: string | null
  lastChatAt: string | null
  lastActivity: { name: string; at: string; note: string | null } | null
  createdAt: string
  nextFollowUpAt: string | null
  idleDays: number | null
  canAct: boolean
}

/** Jumlah baris per halaman — dipakai bareng oleh query & komponen Pagination. */
const PAGE_SIZE = 50

interface MetaOption {
  id: string
  name: string
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })
}

function relTime(iso: string | null) {
  if (!iso) return "—"
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "baru saja"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}h`
  return fmtDate(iso)
}

export const LeadListClient: React.FC<{
  isSales?: boolean
  forcedOutcome?: string
  title?: string
  /** Menu Lead Potensial — cuma lead yang sudah digeser Tim, dan filter "Pemilahan" disembunyikan
   *  (di daftar yang isinya memang semua potensial, filter itu tidak ada gunanya). */
  potentialOnly?: boolean
}> = ({ isSales = false, forcedOutcome, title = "Lead", potentialOnly = false }) => {
  const [rows, setRows] = useState<LeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [scope, setScope] = useState<"all" | "mine">(isSales ? "mine" : searchParams.get("scope") === "mine" ? "mine" : "all")
  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const [segmentId, setSegmentId] = useState(searchParams.get("segmentId") ?? "")
  const [buyingPowerTierId, setBuyingPowerTierId] = useState(searchParams.get("buyingPowerTierId") ?? "")
  const [temperature, setTemperature] = useState(searchParams.get("temperature") ?? "")
  const [stage, setStage] = useState(searchParams.get("stage") ?? "")
  const [outcome, setOutcome] = useState(forcedOutcome ?? searchParams.get("outcome") ?? "")
  const [priorityLevel, setPriorityLevel] = useState(searchParams.get("priorityLevel") ?? "")
  const [picUserId, setPicUserId] = useState(searchParams.get("picUserId") ?? "")
  // "" = semua · "1" = sudah digeser ke Lead Potensial · "0" = belum dipilah (buat sesi pemilahan).
  const [potential, setPotential] = useState(potentialOnly ? "1" : (searchParams.get("potential") ?? ""))
  const defaultSort = potentialOnly ? "potential" : "priority"
  const [sort, setSort] = useState(searchParams.get("sort") ?? defaultSort)
  // Filter tanggal MASUK lead (firstContactAt) — lihat DateRangeFilter & date-range.ts.
  const [dateRange, setDateRange] = useState<DateRangePreset>((searchParams.get("dateRange") as DateRangePreset) ?? "all")
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "")
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "")
  // Nomor halaman ikut disimpan di URL, sama seperti filter — dulu daftarnya pakai tombol "Muat
  // lebih banyak" yang menumpuk baris di memori doang, jadi begitu user buka Detail Lead lalu
  // pencet Back, semua tumpukan itu hilang dan balik ke halaman 1 (padahal filternya kembali
  // benar). Dengan nomor halaman di URL, Back memulihkan halaman yang sama persis.
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get("page")) || 1))

  const [segments, setSegments] = useState<MetaOption[]>([])
  const [buyingPowerTiers, setBuyingPowerTiers] = useState<MetaOption[]>([])
  const [users, setUsers] = useState<MetaOption[]>([])
  const [sources, setSources] = useState<MetaOption[]>([])
  const qDebounced = useRef(q)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ displayName: "", whatsappNumber: "", companyName: "", contactName: "", segmentId: "", sourceId: "" })
  const [addErr, setAddErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const submitAdd = async () => {
    setAdding(true)
    setAddErr(null)
    try {
      const res = await fetch("/api/marketing/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })
      const d = await res.json()
      if (!res.ok) {
        setAddErr(d.error || "Gagal membuat lead")
        return
      }
      router.push(`/marketing/leads/${d.lead.id}?syncHistory=1`)
    } finally {
      setAdding(false)
    }
  }

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.segments) setSegments(d.segments)
        if (d.buyingPowerTiers) setBuyingPowerTiers(d.buyingPowerTiers)
        if (d.sources) setSources(d.sources)
        if (d.users) setUsers(d.users)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(
    async () => {
      setLoading(true)
      try {
        const p = new URLSearchParams({ scope, sort, limit: String(PAGE_SIZE), page: String(page) })
        if (qDebounced.current.trim()) p.set("q", qDebounced.current.trim())
        if (segmentId) p.set("segmentId", segmentId)
        if (buyingPowerTierId) p.set("buyingPowerTierId", buyingPowerTierId)
        if (temperature) p.set("temperature", temperature)
        if (stage) p.set("stage", stage)
        if (outcome) p.set("outcome", outcome)
        if (priorityLevel) p.set("priorityLevel", priorityLevel)
        if (picUserId) p.set("picUserId", picUserId)
        if (potential) p.set("potential", potential)
        if (dateRange !== "all") p.set("dateRange", dateRange)
        if (dateRange === "custom") {
          if (dateFrom) p.set("dateFrom", dateFrom)
          if (dateTo) p.set("dateTo", dateTo)
        }

        {
          // Simpan filter + halaman ke URL (replace, bukan push) supaya kalau user buka Detail
          // Lead lalu pencet tombol Back, yang tadi dipilih masih kepakai — bukan reset ke default.
          const urlParams = new URLSearchParams()
          if (!isSales && scope !== "all") urlParams.set("scope", scope)
          if (qDebounced.current.trim()) urlParams.set("q", qDebounced.current.trim())
          if (segmentId) urlParams.set("segmentId", segmentId)
          if (buyingPowerTierId) urlParams.set("buyingPowerTierId", buyingPowerTierId)
          if (temperature) urlParams.set("temperature", temperature)
          if (stage) urlParams.set("stage", stage)
          if (!forcedOutcome && outcome) urlParams.set("outcome", outcome)
          if (priorityLevel) urlParams.set("priorityLevel", priorityLevel)
          if (picUserId) urlParams.set("picUserId", picUserId)
          if (!potentialOnly && potential) urlParams.set("potential", potential)
          if (sort !== defaultSort) urlParams.set("sort", sort)
          if (dateRange !== "all") urlParams.set("dateRange", dateRange)
          if (dateRange === "custom") {
            if (dateFrom) urlParams.set("dateFrom", dateFrom)
            if (dateTo) urlParams.set("dateTo", dateTo)
          }
          if (page > 1) urlParams.set("page", String(page))
          const qs = urlParams.toString()
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
        }

        const res = await fetch(`/api/marketing/leads?${p}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Gagal memuat")
          return
        }
        setError(null)
        setRows(data.leads)
        setTotal(data.total)
      } finally {
        setLoading(false)
      }
    },
    [page, scope, sort, segmentId, buyingPowerTierId, temperature, stage, outcome, priorityLevel, picUserId, potential, dateRange, dateFrom, dateTo, isSales, forcedOutcome, potentialOnly, defaultSort, pathname, router],
  )

  useEffect(() => {
    load()
  }, [load])

  // Ganti filter = hasil barunya beda total, jadi halaman balik ke 1. Render pertama dilewati
  // supaya halaman yang dipulihkan dari URL (kasus Back) tidak ikut kereset ke 1.
  const filterSig = JSON.stringify([scope, sort, segmentId, buyingPowerTierId, temperature, stage, outcome, priorityLevel, picUserId, potential, dateRange, dateFrom, dateTo])
  const firstRenderRef = useRef(true)
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    setPage(1)
  }, [filterSig])

  // Kembalikan posisi scroll kalau user datang dari Back (mis. habis buka Detail Lead) — baru
  // dijalankan setelah barisnya ter-render, lihat catatan di useListScrollRestore.
  useListScrollRestore(!loading && rows.length > 0)

  useEffect(() => {
    const t = setTimeout(() => {
      qDebounced.current = q
      // Kata kunci baru = hasil baru, mulai lagi dari halaman 1. Kalau kebetulan sudah di
      // halaman 1, setPage tidak mengubah apa-apa jadi load() dipanggil manual.
      if (page !== 1) setPage(1)
      else load()
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const opt = (arr: MetaOption[]) => arr.map((s) => ({ value: s.id, label: s.name }))

  /**
   * Hasil klik tombol Potensial diterapkan OPTIMISTIC ke baris yang bersangkutan, bukan `load()`
   * ulang. Ini alat pemilahan massal: satu refetch per klik berarti skeleton berkedip dan posisi
   * scroll hilang tiap kali satu baris dipilah — praktis tidak bisa dipakai untuk menyusuri
   * ratusan lead. Di menu Lead Potensial, lead yang dilepas memang langsung keluar dari daftar
   * (dia sudah tidak termasuk isi menu ini); di daftar Lead biasa barisnya tetap di tempatnya,
   * cuma penandanya berubah, supaya urutan tidak melompat di bawah kursor.
   */
  const applyPotential = (id: string, nowPotential: boolean) => {
    if (potentialOnly && !nowPotential) {
      setRows((prev) => prev.filter((r) => r.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      return
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              potentialAt: nowPotential ? new Date().toISOString() : null,
              potentialNote: nowPotential ? r.potentialNote : null,
            }
          : r,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <MktHeader
        title={
          <>
            {title} <span className="text-sm font-bold text-slate-400">({total})</span>
          </>
        }
      >
        {/* "Tambah Lead" tidak ditampilkan di menu turunan (Client Lama, Lead Potensial) — lead
            baru yang dibuat dari situ tidak akan muncul di daftarnya sendiri, jadi tombolnya cuma
            bikin bingung. */}
        {!forcedOutcome && !potentialOnly && (
          <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setShowAdd(true); setAddErr(null) }}>
            Tambah Lead
          </Button>
        )}
        {!isSales && <ScopeToggle value={scope === "mine" ? "mine" : "all"} onChange={(v) => setScope(v)} order={["all", "mine"]} />}
      </MktHeader>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama, perusahaan, kontak, nomor, atau isi chat…"
        leftIcon={<Search className="w-4 h-4" />}
        sizeVariant="md"
      />

      <div className="flex flex-wrap gap-2">
        {/* Tanggal ditaruh paling depan — dari semua filter di baris ini, ini yang paling sering
            dipakai buat pertanyaan harian ("lead hari ini berapa?"). Basisnya tanggal MASUK. */}
        <DateRangeFilter
          preset={dateRange}
          from={dateFrom}
          to={dateTo}
          onChange={(next) => {
            setDateRange(next.preset)
            setDateFrom(next.from)
            setDateTo(next.to)
          }}
        />
        <div className="w-40">
          <Select options={[{ value: "", label: "Semua Segmen" }, ...opt(segments)]} value={segmentId} onChange={setSegmentId} sizeVariant="sm" />
        </div>
        <div className="w-44">
          <Select
            options={[{ value: "", label: "Semua Kemampuan Beli" }, ...opt(buyingPowerTiers)]}
            value={buyingPowerTierId}
            onChange={setBuyingPowerTierId}
            sizeVariant="sm"
          />
        </div>
        <div className="w-36">
          <Select
            options={[
              { value: "", label: "Semua Temperatur" },
              { value: "HOT", label: "Hot" },
              { value: "WARM", label: "Warm" },
              { value: "COLD", label: "Cold" },
            ]}
            value={temperature}
            onChange={setTemperature}
            sizeVariant="sm"
          />
        </div>
        <div className="w-36">
          <Select
            options={[
              { value: "", label: "Semua Tahap" },
              { value: "NONE", label: "Belum" },
              { value: "DISCUSSION", label: "Diskusi" },
              { value: "ZOOM_DEMO", label: "Zoom/Demo" },
              { value: "PROPOSAL", label: "Penawaran" },
              { value: "NEGOTIATION", label: "Negosiasi" },
            ]}
            value={stage}
            onChange={setStage}
            sizeVariant="sm"
          />
        </div>
        {!forcedOutcome && (
        <div className="w-36">
          <Select
            options={[
              { value: "", label: "Semua Outcome" },
              { value: "OPEN", label: "Open" },
              { value: "WON", label: "Won" },
              { value: "LOST", label: "Lost" },
              { value: "NOT_RELEVANT", label: "Bukan Prospek" },
            ]}
            value={outcome}
            onChange={setOutcome}
            sizeVariant="sm"
          />
        </div>
        )}
        <div className="w-36">
          <Select
            options={[
              { value: "", label: "Semua Prioritas" },
              { value: "TOP", label: "Utama" },
              { value: "HIGH", label: "Tinggi" },
              { value: "MONITOR", label: "Pantau" },
              { value: "LOW", label: "Rendah" },
            ]}
            value={priorityLevel}
            onChange={setPriorityLevel}
            sizeVariant="sm"
          />
        </div>
        {!isSales && (
          <div className="w-40">
            <Select options={[{ value: "", label: "Semua PIC" }, ...opt(users)]} value={picUserId} onChange={setPicUserId} sizeVariant="sm" />
          </div>
        )}
        {!potentialOnly && (
          <div className="w-44">
            <Select
              options={[
                { value: "", label: "Semua (dipilah/belum)" },
                { value: "1", label: "Sudah Potensial" },
                { value: "0", label: "Belum Dipilah" },
              ]}
              value={potential}
              onChange={setPotential}
              sizeVariant="sm"
            />
          </div>
        )}
        <div className="w-48">
          <Select
            options={[
              ...(potentialOnly ? [{ value: "potential", label: "Urut: Waktu Digeser" }] : []),
              { value: "priority", label: "Urut: Skor Prioritas" },
              { value: "chat", label: "Urut: Chat Terakhir" },
              { value: "recent", label: "Urut: Interaksi Terbaru" },
              { value: "created", label: "Urut: Terbaru Dibuat" },
            ]}
            value={sort}
            onChange={setSort}
            sizeVariant="sm"
          />
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <SkeletonList rows={6} />
      ) : rows.length === 0 ? (
        <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
          Tidak ada lead.
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Segmen</TableHead>
                    <TableHead>Temp</TableHead>
                    <TableHead>Tahap</TableHead>
                    <TableHead>Aktivitas Terakhir</TableHead>
                    <TableHead className="text-right">Skor</TableHead>
                    <TableHead>PIC</TableHead>
                    <TableHead>Chat Terakhir</TableHead>
                    <TableHead>Follow Up</TableHead>
                    <TableHead>Potensial</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        {/* Status (Won/Lost/dst) ditaruh nempel nama, bukan cuma di kolom Outcome
                            paling kanan yang sering ketutup scroll horizontal. */}
                        <div className="flex items-center gap-1.5">
                          <Link href={`/marketing/leads/${l.id}`} className="font-bold text-slate-800 hover:text-blue-700">
                            {l.displayName}
                          </Link>
                          <OutcomeBadge outcome={l.outcome} lostReason={l.lostReasonName} />
                          <PriorityPinBadge pinnedAt={l.priorityPinnedAt} note={l.priorityPinNote} compact />
                        </div>
                        <div className="text-xs text-slate-400">{l.companyName || l.whatsappNumber}</div>
                        {l.priorityPinnedAt && l.priorityPinNote && (
                          <div className="text-xs font-bold text-amber-700 truncate max-w-[220px] mt-0.5">
                            ⭐ {l.priorityPinNote}
                            {l.priorityPinnedByName ? <span className="font-medium text-amber-600"> — {l.priorityPinnedByName}</span> : null}
                          </div>
                        )}
                        {l.potentialAt && (l.potentialNote || l.potentialByName) && (
                          <div className="text-xs font-bold text-violet-700 truncate max-w-[220px] mt-0.5">
                            💎 {l.potentialNote || "Digeser ke Potensial"}
                            {l.potentialByName ? <span className="font-medium text-violet-500"> — {l.potentialByName}</span> : null}
                          </div>
                        )}
                        {l.note && <div className="text-xs text-amber-700 italic truncate max-w-[220px] mt-0.5">📌 {l.note}</div>}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {l.segmentName ?? "—"}
                        {l.buyingPowerTierName && (
                          <div className="text-[11px] font-semibold text-emerald-700">💰 {l.buyingPowerTierName}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tempBadgeVariant(l.temperature)} size="sm">{l.temperature}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{STAGE_LABEL[l.currentActivityStage] ?? l.currentActivityStage}</TableCell>
                      <TableCell className="text-slate-600">
                        {l.lastActivity ? (
                          <>
                            {l.lastActivity.name}
                            <span className="text-xs text-slate-400"> · {relTime(l.lastActivity.at)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-700">{Math.round(l.priorityScore)}</TableCell>
                      <TableCell className="text-slate-600">{l.pic?.name ?? "—"}</TableCell>
                      <TableCell className="text-slate-500">{relTime(l.lastChatAt)}</TableCell>
                      <TableCell className="text-slate-500">{fmtDate(l.nextFollowUpAt)}</TableCell>
                      <TableCell>
                        {/* Tombol pemilahan — satu klik geser/lepas, tanpa modal (lihat
                            PotentialButton). Tombolnya sendiri sudah menunjukkan statusnya, jadi
                            di tabel tidak perlu badge lagi. */}
                        <PotentialButton
                          leadId={l.id}
                          potentialAt={l.potentialAt}
                          potentialNote={l.potentialNote}
                          mode="toggle"
                          onDone={() => applyPotential(l.id, !l.potentialAt)}
                        />
                      </TableCell>
                      <TableCell>
                        <OutcomeBadge outcome={l.outcome} lostReason={l.lostReasonName} /> {l.outcome === "OPEN" ? <span className="text-slate-400">Open</span> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>

          {/* Mobile cards */}
          <ul className="lg:hidden flex flex-col gap-1.5">
            {rows.map((l) => (
              <li key={l.id}>
                <Link href={`/marketing/leads/${l.id}`}>
                  <Card variant="solid" padding="sm" hoverable className="!rounded-2xl">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800 truncate">{l.displayName}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <PriorityPinBadge pinnedAt={l.priorityPinnedAt} note={l.priorityPinNote} compact />
                        <PotentialBadge potentialAt={l.potentialAt} note={l.potentialNote} compact />
                        <OutcomeBadge outcome={l.outcome} lostReason={l.lostReasonName} />
                        <Badge variant={tempBadgeVariant(l.temperature)} size="sm">{l.temperature}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{l.companyName || l.whatsappNumber}</p>
                    {l.priorityPinnedAt && l.priorityPinNote && (
                      <p className="text-xs font-bold text-amber-700 truncate mt-0.5">⭐ {l.priorityPinNote}</p>
                    )}
                    {l.potentialAt && l.potentialNote && (
                      <p className="text-xs font-bold text-violet-700 truncate mt-0.5">💎 {l.potentialNote}</p>
                    )}
                    {l.note && <p className="text-xs text-amber-700 italic truncate mt-0.5">📌 {l.note}</p>}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {l.segmentName && <Badge variant="secondary" size="sm">{l.segmentName}</Badge>}
                      {l.buyingPowerTierName && <Badge variant="success" size="sm">💰 {l.buyingPowerTierName}</Badge>}
                      <Badge variant="secondary" size="sm">{STAGE_LABEL[l.currentActivityStage] ?? l.currentActivityStage}</Badge>
                      <Badge variant="info" size="sm">Skor {Math.round(l.priorityScore)}</Badge>
                      {l.pic && <span className="text-[10px] font-semibold text-slate-400">PIC: {l.pic.name}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 min-w-0">
                        <span>💬 {relTime(l.lastChatAt)}</span>
                        {l.lastActivity && <span className="truncate">· {l.lastActivity.name} {relTime(l.lastActivity.at)}</span>}
                      </div>
                      {/* Tombolnya di dalam <Link> ke detail — klik-nya distop di PotentialButton
                          supaya memilah dari HP tidak ikut membuka halaman detail tiap baris. */}
                      <PotentialButton
                        leadId={l.id}
                        potentialAt={l.potentialAt}
                        potentialNote={l.potentialNote}
                        mode="toggle"
                        onDone={() => applyPotential(l.id, !l.potentialAt)}
                      />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <Card variant="solid" padding="none" className="!rounded-2xl">
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={(next) => {
                setPage(next)
                // Pindah halaman = konten ganti total; tetap di posisi scroll lama bikin user
                // mendarat di tengah daftar baru tanpa konteks.
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
            />
          </Card>
        </>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Tambah Lead Manual" size="sm">
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-slate-400">Lead dari luar WhatsApp (pameran, referral, dsb). Kamu otomatis jadi PIC.</p>
          {addErr && <Alert variant="error">{addErr}</Alert>}
          <Input placeholder="Nama lead *" value={addForm.displayName} onChange={(e) => setAddForm((f) => ({ ...f, displayName: e.target.value }))} sizeVariant="sm" />
          <Input
            placeholder="No. WhatsApp * (08… / 62…)"
            value={addForm.whatsappNumber}
            onChange={(e) => setAddForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
            sizeVariant="sm"
          />
          <Input placeholder="Perusahaan" value={addForm.companyName} onChange={(e) => setAddForm((f) => ({ ...f, companyName: e.target.value }))} sizeVariant="sm" />
          <Input placeholder="Nama kontak" value={addForm.contactName} onChange={(e) => setAddForm((f) => ({ ...f, contactName: e.target.value }))} sizeVariant="sm" />
          <Select
            options={[{ value: "", label: "Segmen (opsional)" }, ...opt(segments)]}
            value={addForm.segmentId}
            onChange={(v) => setAddForm((f) => ({ ...f, segmentId: v }))}
            sizeVariant="sm"
          />
          <Select
            options={[{ value: "", label: "Sumber (opsional)" }, ...opt(sources)]}
            value={addForm.sourceId}
            onChange={(v) => setAddForm((f) => ({ ...f, sourceId: v }))}
            sizeVariant="sm"
          />
          <div className="flex gap-2 mt-1">
            <Button size="sm" onClick={submitAdd} isLoading={adding} disabled={!addForm.displayName.trim() || !addForm.whatsappNumber.trim()}>
              Simpan
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
