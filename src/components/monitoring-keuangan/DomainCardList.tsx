"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search, ExternalLink, Globe } from "lucide-react"
import { Card, CardTitle, CardDescription, Button, Badge, Input, Select } from "@/components/ui"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { FollowUpButtons } from "@/components/dashboard/FollowUpButtons"
import { EditablePicInfo } from "@/components/dashboard/EditablePicInfo"
import { OwnerCell } from "@/components/shared/OwnerCell"
import { EditableDateCell } from "@/components/shared/EditableDateCell"
import { PiutangFollowUpButton } from "@/components/dashboard/PiutangFollowUpButton"
import { PiutangStatusCell } from "@/components/dashboard/PiutangStatusTools"
import { SyncDomainStatusButton } from "@/components/dashboard/SyncDomainStatusButton"
import { DeactivateDomainButton } from "@/components/dashboard/DeactivateDomainButton"
import { domainFollowUpMessage } from "@/lib/follow-up-templates"
import { getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { CLIENT_RESPONSE_LABEL, type ClientResponseType } from "@/lib/billing-follow-up"
import { type DomainExpiringRow, bucketLabel, SlaBadge, TagihAction } from "@/components/dashboard/DashboardSections"

export type DomainCardRow = DomainExpiringRow & {
  lastResponse: { responseType: string; note: string | null; createdAt: string } | null
}

function formatRupiah(n: number | null) {
  if (!n) return "-"
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

function formatDate(iso: string | null) {
  if (!iso) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

/** "3 hari lalu" — dipakai di Track (kapan ditagih/dibayar) & Respon Terakhir, biar langsung
 *  kebaca umurnya tanpa mengira-ngira dari tanggal. */
function relativeDays(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return "Hari ini"
  if (days === 1) return "1 hari lalu"
  return `${days} hari lalu`
}

const BUCKET_DATE_CLASS: Record<ExpiryBucket, string> = {
  expired: "text-rose-700",
  expiring_this_month: "text-amber-700",
  expiring_next_month: "text-sky-700",
  safe: "text-slate-800",
}

const STATUS_FILTER_OPTIONS: { value: ExpiryBucket | "all"; label: string }[] = [
  { value: "all", label: "Semua Status" },
  { value: "expired", label: bucketLabel.expired },
  { value: "expiring_this_month", label: bucketLabel.expiring_this_month },
  { value: "expiring_next_month", label: bucketLabel.expiring_next_month },
  { value: "safe", label: bucketLabel.safe },
]

export const DomainCardList: React.FC<{
  rows: DomainCardRow[]
  clients: { id: string; name: string }[]
  isOwner: boolean
  title?: string
  description?: string
}> = ({ rows: initialRows, clients, isOwner, title = "Daftar Domain", description }) => {
  const [rows, setRows] = useState(initialRows)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ExpiryBucket | "all">("all")

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => statusFilter === "all" || r.bucket === statusFilter)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q))
  }, [rows, query, statusFilter])

  return (
    <Card variant="panel" padding="none" className="overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-0.5">{description ?? `${rows.length} domain aktif yang dikelola`}</CardDescription>
        </div>
        <SyncDomainStatusButton />
      </div>

      <div className="px-5 sm:px-6 pb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px]">
          <Input sizeVariant="sm" placeholder="Cari domain atau client..." leftIcon={<Search className="w-4 h-4" />} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="w-full sm:w-52">
          <Select
            sizeVariant="sm"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as ExpiryBucket | "all")}
            options={STATUS_FILTER_OPTIONS}
            searchable={false}
          />
        </div>
      </div>

      <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex flex-col gap-3">
        {filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 text-center text-slate-400 text-xs font-semibold py-8">
            {rows.length === 0 ? "Belum ada domain." : "Tidak ada domain yang cocok dengan pencarian/filter."}
          </div>
        ) : (
          filteredRows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 sm:p-5">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-4 lg:gap-5 lg:items-start">
                {/* Domain: nama + owner + PIC + follow-up WA */}
                <div className="flex gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-700 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 break-words">{r.name}</div>
                    <div className="text-xs text-slate-600 truncate">{r.owner}</div>
                    {r.clientId && (
                      <>
                        <EditablePicInfo
                          clientId={r.clientId}
                          picName={r.picName}
                          picPhone={r.clientPhone}
                          onUpdated={(patch) => setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, picName: patch.picName, clientPhone: patch.picPhone } : row)))}
                        />
                        <div className="mt-1">
                          <FollowUpButtons
                            phone={r.clientPhone}
                            clientId={r.clientId}
                            clientName={r.owner}
                            message={domainFollowUpMessage({ clientName: r.owner, domainName: r.name, dueDate: r.dueDate })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Kontrak: Internal/Client + Tgl Berakhir */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Internal/Client</span>
                  <OwnerCell
                    apiPath={`/api/domains/${r.id}`}
                    itemName={r.name}
                    clientId={r.clientId}
                    clients={clients}
                    onUpdated={(patch) => setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, clientId: patch.clientId, owner: patch.clientName ?? "Internal" } : row)))}
                  />
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Tgl Berakhir</span>
                    <div className={`text-sm font-bold ${BUCKET_DATE_CLASS[r.bucket]}`}>
                      <EditableDateCell
                        apiPath={`/api/domains/${r.id}`}
                        field="expiryDate"
                        value={r.expiryDate}
                        formatDate={(d) => formatDate(d ? d.toISOString() : null)}
                        title="Klik untuk ubah tanggal berakhir"
                        onUpdated={(expiryDate) =>
                          setRows((prev) =>
                            prev.map((row) => (row.id === r.id ? { ...row, expiryDate, dueDate: expiryDate, bucket: getExpiryBucket(expiryDate ? new Date(expiryDate) : null) } : row))
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Harga & Status — satu badge status saja (SLA kalau ada siklus, "Aktif" kalau tidak) */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Harga Jual</span>
                  <span className="text-sm font-black text-slate-900">{formatRupiah(r.price)}</span>
                  <div className="mt-0.5">
                    {r.sla ? <SlaBadge sla={r.sla} /> : <Badge variant="success" size="sm">Aktif</Badge>}
                  </div>
                </div>

                {/* Track & Respon Terakhir */}
                <div className="flex flex-col gap-2.5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Track</span>
                    <div className="text-xs mt-1">
                      {r.invoicedAt ? (
                        <span className="font-semibold text-slate-700">{relativeDays(r.invoicedAt)}</span>
                      ) : (
                        <span className="text-slate-400">Belum ditagih</span>
                      )}
                      {r.invoiceNumber &&
                        (r.invoiceId ? (
                          <Link href={`/penjualan/${r.invoiceId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {" "}
                            · {r.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="text-slate-500"> · {r.invoiceNumber}</span>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-0.5">
                      {r.paidAt ? (
                        <span className="font-semibold text-emerald-700">{relativeDays(r.paidAt)}</span>
                      ) : (
                        <span className="text-slate-400">Belum bayar</span>
                      )}
                      {r.paymentNumber &&
                        (r.paymentId ? (
                          <Link href={`/pembayaran/${r.paymentId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            · {r.paymentNumber}
                          </Link>
                        ) : (
                          <span className="text-slate-500">· {r.paymentNumber}</span>
                        ))}
                      {r.paymentPostStatus && <StatusBadge type={r.paymentPostStatus === "posted" ? "posted" : "draft"} size="sm" />}
                    </div>
                  </div>

                  {r.lastResponse && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Respon Terakhir</span>
                      <div className="text-xs mt-1">
                        <span className="font-semibold text-slate-700">{CLIENT_RESPONSE_LABEL[r.lastResponse.responseType as ClientResponseType] ?? r.lastResponse.responseType}</span>
                        <span className="text-slate-400"> · {relativeDays(r.lastResponse.createdAt)}</span>
                      </div>
                      {r.lastResponse.note && <div className="text-[11px] text-slate-500 mt-0.5 break-words">{r.lastResponse.note}</div>}
                    </div>
                  )}
                </div>

                {/* Aksi */}
                <div className="flex flex-col items-start gap-1.5 lg:min-w-[150px]">
                  {r.clientId ? (
                    <TagihAction
                      sla={r.sla}
                      invoiceId={r.invoiceId}
                      tagihHref={`/penjualan/baru?${new URLSearchParams({ clientId: r.clientId, description: `Perpanjangan domain ${r.name}`, amount: String(r.price ?? 0), domainId: r.id }).toString()}`}
                    />
                  ) : isOwner ? (
                    <Link href={`/keuangan/kas-keluar/baru?domainId=${r.id}`}>
                      <Button size="sm" variant="outline">
                        Bayar Sekarang
                      </Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">Internal</span>
                  )}
                  {r.sla?.stage === "menunggu_jawaban" && r.billingFollowUpId && <PiutangFollowUpButton billingFollowUpId={r.billingFollowUpId} itemLabel={r.name} />}
                  {isOwner && <DeactivateDomainButton domainId={r.id} domainName={r.name} variant="segment" />}
                  {isOwner && r.clientId && (
                    <PiutangStatusCell itemId={r.id} basePath="domains" itemLabel={`${r.name} — ${r.owner}`} remaining={r.price ?? 0} pendingAt={r.pendingAt} pendingReason={r.pendingReason} />
                  )}
                  {r.name && (
                    <a
                      href={`https://${r.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" /> Buka domain
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
