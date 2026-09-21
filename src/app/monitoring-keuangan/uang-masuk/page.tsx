import { prisma } from "@/lib/prisma"
import { Card, CardDescription } from "@/components/ui"
import { Globe, Server as ServerIcon, Wrench, FolderKanban, TrendingUp } from "lucide-react"
import { getCurrentUser } from "@/lib/current-user"
import { resolveDomainExpiry, getExpiryBucket } from "@/lib/domain-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"
import { buildRevenueForecast } from "@/lib/revenue-forecast"
import { DomainSummaryCards } from "@/components/monitoring-keuangan/DomainSummaryCards"
import { DomainExpiringSection, type DomainExpiringRow } from "@/components/dashboard/DashboardSections"

export default async function UangMasukPage() {
  const user = await getCurrentUser()
  const isOwner = user.role === "owner"

  const [domains, serverCount, maintenanceCount, projectCount, clientOptions, accounts] = await Promise.all([
    // doubtfulAt/pendingAt: null — domain yang ditahan Owner sengaja dikeluarkan, sama pola
    // dengan Dashboard utama (lihat src/app/dashboard/page.tsx).
    prisma.domain.findMany({ where: { active: true, doubtfulAt: null, pendingAt: null }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.server.count({ where: { active: true, doubtfulAt: null, pendingAt: null } }),
    prisma.maintenance.count({ where: { active: true } }),
    prisma.project.count({ where: { status: "berjalan" } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  const domainRowsBase = domains.map((d) => {
    const expiry = resolveDomainExpiry(d)
    return {
      id: d.id,
      name: d.name,
      owner: d.client?.name ?? "Internal",
      clientId: d.clientId,
      picName: d.client?.picName ?? null,
      clientPhone: d.client ? d.client.picPhone || d.client.phoneNumber : null,
      price: d.sellPrice,
      lastPaidAt: d.lastPaidAt ? d.lastPaidAt.toISOString() : null,
      expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
      dueDate: expiry ? expiry.toISOString() : null,
      bucket: getExpiryBucket(expiry),
      pendingAt: d.pendingAt ? d.pendingAt.toISOString() : null,
      pendingReason: d.pendingReason,
    }
  })

  // Siklus SLA (belum ditagih/sudah ditagih/belum bayar) cuma relevan buat domain yang PUNYA
  // Client dan LAGI due (bucket != "safe") — sama syarat dengan Dashboard utama. Domain Internal
  // (tanpa Client) dan domain yang expiry-nya masih jauh otomatis dianggap "Aktif" (SLA null,
  // ditangani SlaBadge/TagihAction di DomainExpiringSection).
  const slaRefs: BillingFollowUpRef[] = domainRowsBase
    .filter((r) => r.clientId && r.bucket !== "safe")
    .map((r) => ({ refType: "domain" as const, refId: r.id }))
  await ensureBillingFollowUps(prisma, slaRefs)
  const activeFollowUps =
    slaRefs.length > 0 ? await prisma.billingFollowUp.findMany({ where: { paidRecordedAt: null, OR: slaRefs.map((r) => ({ refType: r.refType, refId: r.refId })) } }) : []
  const followUpByRef = new Map(activeFollowUps.map((f) => [`domain:${f.refId}`, f]))

  const followUpInvoiceIds = activeFollowUps.map((f) => f.invoiceId).filter((id): id is string => Boolean(id))
  const followUpInvoices =
    followUpInvoiceIds.length > 0
      ? await prisma.invoice.findMany({
          where: { id: { in: followUpInvoiceIds } },
          select: {
            id: true,
            invoiceNumber: true,
            payments: { orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true, payment: { select: { id: true, paymentNumber: true, postStatus: true } } } },
          },
        })
      : []
  const invoiceById = new Map(followUpInvoices.map((inv) => [inv.id, inv]))

  const domainRows: DomainExpiringRow[] = domainRowsBase
    .map((r) => {
      const record = r.clientId ? followUpByRef.get(`domain:${r.id}`) : undefined
      const invoice = record?.invoiceId ? invoiceById.get(record.invoiceId) : undefined
      const latestPayment = invoice?.payments[0]
      return {
        ...r,
        billingFollowUpId: record?.id ?? null,
        invoiceId: record?.invoiceId ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        invoicedAt: record?.invoicedAt ? record.invoicedAt.toISOString() : null,
        paidAt: latestPayment ? latestPayment.paidAt.toISOString() : null,
        paymentId: latestPayment?.payment?.id ?? null,
        paymentNumber: latestPayment?.payment?.paymentNumber ?? null,
        paymentPostStatus: latestPayment?.payment?.postStatus ?? null,
        sla: record ? computeSlaStatus(record) : null,
      }
    })
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))

  const totalDomain = domainRows.length
  const belumTagih = domainRows.filter((r) => r.sla?.stage === "belum_ditagih" || r.sla?.stage === "tagih_lagi").length
  const sudahDitagih = domainRows.filter((r) => r.sla?.stage === "menunggu_jawaban" || r.sla?.stage === "menunggu_bayar").length
  const belumBayar = domainRows.filter((r) => r.sla?.stage === "menunggu_bayar").length

  // Distribusi jatuh tempo domain 12 bulan KE DEPAN (bukan histori — data histori bulanan tidak
  // disimpan) — pakai fungsi forecast yang sama dengan section Prediksi Pendapatan di Dashboard.
  const forecastMonths = buildRevenueForecast({
    domains: domainRowsBase.filter((d) => d.clientId).map((d) => ({ name: d.name, price: d.price ?? 0, expiry: d.dueDate ? new Date(d.dueDate) : null })),
    servers: [],
    maintenances: [],
    projectSchedules: [],
  })
  const domainTrend = forecastMonths.map((m) => ({ label: m.label, count: m.items.length }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="feature" padding="md">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-sky-500/15 text-sky-700 flex items-center justify-center flex-shrink-0"><Globe className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Domain</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{totalDomain}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Total Domain</p>
        </Card>
        <Card variant="feature" padding="md" className="opacity-60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-violet-500/15 text-violet-700 flex items-center justify-center flex-shrink-0"><ServerIcon className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Server</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{serverCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Segera hadir</p>
        </Card>
        <Card variant="feature" padding="md" className="opacity-60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-fuchsia-500/15 text-fuchsia-700 flex items-center justify-center flex-shrink-0"><Wrench className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Maintenance</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{maintenanceCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Segera hadir</p>
        </Card>
        <Card variant="feature" padding="md" className="opacity-60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center flex-shrink-0"><FolderKanban className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Proyek</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{projectCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Segera hadir</p>
        </Card>
      </div>

      <Card variant="feature" padding="md" className="opacity-70">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-5 h-5" /></span>
          <div>
            <p className="text-sm font-bold text-slate-700">Prediksi Pendapatan</p>
            <p className="text-[11px] text-slate-500 font-semibold">Gabungan Domain/Server/Maintenance/Proyek — segera hadir, lihat sementara di Dashboard.</p>
          </div>
        </div>
      </Card>

      <DomainSummaryCards total={totalDomain} belumTagih={belumTagih} sudahDitagih={sudahDitagih} belumBayar={belumBayar} trend={domainTrend} />

      <DomainExpiringSection
        rows={domainRows}
        clients={clientOptions}
        accounts={accounts}
        isOwner={isOwner}
        showSafeBucket
        title="Daftar Domain"
        description={`${totalDomain} domain aktif yang dikelola — urutkan berdasarkan prioritas penagihan`}
      />
    </div>
  )
}
