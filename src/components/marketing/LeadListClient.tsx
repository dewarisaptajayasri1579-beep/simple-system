"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Search } from "lucide-react"

import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
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
import { MktHeader, ScopeToggle, STAGE_LABEL, tempBadgeVariant } from "./ui"

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
  segmentName: string | null
  pic: { id: string; name: string } | null
  lastInteractionAt: string | null
  createdAt: string
  nextFollowUpAt: string | null
  idleDays: number | null
  canAct: boolean
}

interface MetaOption {
  id: string
  name: string
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })
}

export const LeadListClient: React.FC = () => {
  const [rows, setRows] = useState<LeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [pageNo, setPageNo] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [scope, setScope] = useState<"all" | "mine">("all")
  const [q, setQ] = useState("")
  const [segmentId, setSegmentId] = useState("")
  const [temperature, setTemperature] = useState("")
  const [stage, setStage] = useState("")
  const [outcome, setOutcome] = useState("")
  const [priorityLevel, setPriorityLevel] = useState("")
  const [picUserId, setPicUserId] = useState("")
  const [sort, setSort] = useState("priority")

  const [segments, setSegments] = useState<MetaOption[]>([])
  const [users, setUsers] = useState<MetaOption[]>([])
  const [sources, setSources] = useState<MetaOption[]>([])
  const router = useRouter()
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
      router.push(`/marketing/leads/${d.lead.id}`)
    } finally {
      setAdding(false)
    }
  }

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.segments) setSegments(d.segments)
        if (d.sources) setSources(d.sources)
        if (d.users) setUsers(d.users)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(
    async (page = 1) => {
      if (page === 1) setLoading(true)
      else setLoadingMore(true)
      try {
        const p = new URLSearchParams({ scope, sort, limit: "50", page: String(page) })
        if (qDebounced.current.trim()) p.set("q", qDebounced.current.trim())
        if (segmentId) p.set("segmentId", segmentId)
        if (temperature) p.set("temperature", temperature)
        if (stage) p.set("stage", stage)
        if (outcome) p.set("outcome", outcome)
        if (priorityLevel) p.set("priorityLevel", priorityLevel)
        if (picUserId) p.set("picUserId", picUserId)
        const res = await fetch(`/api/marketing/leads?${p}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Gagal memuat")
          return
        }
        setError(null)
        setRows((prev) => (page === 1 ? data.leads : [...prev, ...data.leads]))
        setTotal(data.total)
        setPageNo(data.page)
        setHasMore(data.hasMore)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [scope, sort, segmentId, temperature, stage, outcome, priorityLevel, picUserId],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setTimeout(() => {
      qDebounced.current = q
      load()
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const opt = (arr: MetaOption[]) => arr.map((s) => ({ value: s.id, label: s.name }))

  return (
    <div className="flex flex-col gap-4">
      <MktHeader
        title={
          <>
            Lead <span className="text-sm font-bold text-slate-400">({total})</span>
          </>
        }
      >
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setShowAdd(true); setAddErr(null) }}>
          Tambah Lead
        </Button>
        <ScopeToggle value={scope === "mine" ? "mine" : "all"} onChange={(v) => setScope(v)} order={["all", "mine"]} />
      </MktHeader>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama, perusahaan, kontak, nomor…"
        leftIcon={<Search className="w-4 h-4" />}
        sizeVariant="md"
      />

      <div className="flex flex-wrap gap-2">
        <div className="w-40">
          <Select options={[{ value: "", label: "Semua Segmen" }, ...opt(segments)]} value={segmentId} onChange={setSegmentId} sizeVariant="sm" />
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
        <div className="w-36">
          <Select
            options={[
              { value: "", label: "Semua Outcome" },
              { value: "OPEN", label: "Open" },
              { value: "WON", label: "Won" },
              { value: "LOST", label: "Lost" },
            ]}
            value={outcome}
            onChange={setOutcome}
            sizeVariant="sm"
          />
        </div>
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
        <div className="w-40">
          <Select options={[{ value: "", label: "Semua PIC" }, ...opt(users)]} value={picUserId} onChange={setPicUserId} sizeVariant="sm" />
        </div>
        <div className="w-48">
          <Select
            options={[
              { value: "priority", label: "Urut: Prioritas" },
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
                    <TableHead className="text-right">Skor</TableHead>
                    <TableHead>PIC</TableHead>
                    <TableHead>Idle</TableHead>
                    <TableHead>Follow Up</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link href={`/marketing/leads/${l.id}`} className="font-bold text-slate-800 hover:text-blue-700">
                          {l.displayName}
                        </Link>
                        <div className="text-xs text-slate-400">{l.companyName || l.whatsappNumber}</div>
                      </TableCell>
                      <TableCell className="text-slate-600">{l.segmentName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={tempBadgeVariant(l.temperature)} size="sm">{l.temperature}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{STAGE_LABEL[l.currentActivityStage] ?? l.currentActivityStage}</TableCell>
                      <TableCell className="text-right font-bold text-slate-700">{Math.round(l.priorityScore)}</TableCell>
                      <TableCell className="text-slate-600">{l.pic?.name ?? "—"}</TableCell>
                      <TableCell className="text-slate-500">{l.idleDays != null ? `${l.idleDays}h` : "—"}</TableCell>
                      <TableCell className="text-slate-500">{fmtDate(l.nextFollowUpAt)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" size="sm">{l.outcome}</Badge>
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
                      <Badge variant={tempBadgeVariant(l.temperature)} size="sm">{l.temperature}</Badge>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{l.companyName || l.whatsappNumber}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {l.segmentName && <Badge variant="secondary" size="sm">{l.segmentName}</Badge>}
                      <Badge variant="secondary" size="sm">{STAGE_LABEL[l.currentActivityStage] ?? l.currentActivityStage}</Badge>
                      <Badge variant="info" size="sm">Skor {Math.round(l.priorityScore)}</Badge>
                      {l.outcome !== "OPEN" && <Badge variant="secondary" size="sm">{l.outcome}</Badge>}
                      {l.pic && <span className="text-[10px] font-semibold text-slate-400">PIC: {l.pic.name}</span>}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {hasMore && (
            <Button variant="secondary" fullWidth isLoading={loadingMore} onClick={() => load(pageNo + 1)}>
              Muat lebih banyak ({rows.length}/{total})
            </Button>
          )}
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
