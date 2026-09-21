import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Card, CardDescription } from "@/components/ui"
import { Globe, Server as ServerIcon, Wrench, FolderKanban, TrendingUp, ChevronRight } from "lucide-react"
import { getCurrentUser } from "@/lib/current-user"
import { resolveDomainExpiry, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, resolveServerExpiry, periodNameToMonths } from "@/lib/recurring-bill-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"
import { buildRevenueForecast } from "@/lib/revenue-forecast"
import { DomainRekapSection, type DomainRekapRow } from "@/components/monitoring-keuangan/DomainRekapSection"
import { ServerDueSection, MaintenanceDueSection, type ServerDueRow, type MaintenanceDueRow } from "@/components/dashboard/DashboardSections"
import { ProjectTagihanSection, type ProjectTagihanRow } from "@/components/dashboard/ProjectTagihanSection"
import { RevenueForecastSection } from "@/components/dashboard/RevenueForecastSection"

const BUCKET_WEIGHT: Record<ExpiryBucket, number> = { expired: 0, expiring_this_month: 1, expiring_next_month: 2, safe: 3 }

function SummaryCard({
  href,
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  label: string
  value: number
  hint: string
}) {
  return (
    <Link href={href}>
      <Card variant="feature" padding="md" hoverable className="h-full">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconClass}`}><Icon className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">{label}</CardDescription>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
        <p className="text-2xl font-black text-slate-900 mt-3">{value}</p>
        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{hint}</p>
      </Card>
    </Link>
  )
}

export default async function UangMasukPage() {
  const user = await getCurrentUser()

  const [domains, servers, maintenances, projectSchedules, clientOptions, accounts] = await Promise.all([
    // doubtfulAt/pendingAt: null — domain/server yang ditahan Owner sengaja dikeluarkan, sama
    // pola dengan Dashboard utama (lihat src/app/dashboard/page.tsx).
    prisma.domain.findMany({ where: { active: true, doubtfulAt: null, pendingAt: null }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.server.findMany({ where: { active: true, doubtfulAt: null, pendingAt: null }, include: { period: true, client: true } }),
    prisma.maintenance.findMany({ where: { active: true }, include: { period: true, client: true } }),
    // Termin project: reminder (sama pola dengan Dashboard) — termin yang sudah ditagih tapi
    // belum lunas, ATAU yang belum ditagih sama sekali.
    prisma.projectPaymentSchedule.findMany({
      where: { project: { status: "berjalan" }, OR: [{ invoiceId: null }, { invoice: { status: { in: ["unpaid", "partial"] } } }] },
      include: {
        project: { include: { client: true } },
        invoice: {
          include: {
            payments: {
              where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] },
              include: { payment: true },
              orderBy: { paidAt: "desc" },
            },
          },
        },
      },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])
  // Forecast pakai jadwal termin project TANPA filter status invoice (proyeksi ke depan, bukan
  // reminder yang masih nyangkut) — sama pola dengan Dashboard.
  const forecastProjectSchedules = await prisma.projectPaymentSchedule.findMany({
    where: { project: { status: "berjalan" } },
    select: { amount: true, dueDate: true, label: true, project: { select: { name: true } } },
  })

  const isOwner = user.role === "owner"

  // ---- Domain ---------------------------------------------------------
  const domainRowsBase = domains.map((d) => {
    const expiry = resolveDomainExpiry(d)
    return {
      id: d.id,
      name: d.name,
      ownerLabel: d.client?.name ?? "Internal 7Smarts",
      clientId: d.clientId,
      price: d.sellPrice,
      dueDate: expiry ? expiry.toISOString() : null,
      bucket: getExpiryBucket(expiry),
    }
  })

  const serverRowsBase = servers.map((s) => {
    const nextDue = resolveServerExpiry(s)
    return {
      id: s.id,
      name: s.name,
      clientId: s.clientId,
      clientName: s.client?.name ?? null,
      picName: s.client?.picName ?? null,
      clientPhone: s.client ? s.client.picPhone || s.client.phoneNumber : null,
      price: s.price,
      dueDate: nextDue ? nextDue.toISOString() : null,
      bucket: getExpiryBucket(nextDue),
      pendingAt: s.pendingAt ? s.pendingAt.toISOString() : null,
      pendingReason: s.pendingReason,
    }
  })

  const maintenanceRowsBase = maintenances.map((m) => {
    const nextDue = computeNextDueDate(m.lastPaidAt, m.period?.name, m.periodCount)
    return {
      id: m.id,
      name: m.name,
      clientId: m.clientId,
      clientName: m.client.name,
      picName: m.client.picName,
      clientPhone: m.client.picPhone || m.client.phoneNumber,
      price: m.price,
      dueDate: nextDue ? nextDue.toISOString() : null,
      bucket: getExpiryBucket(nextDue),
    }
  })

  // Siklus SLA (belum ditagih/sudah ditagih/belum bayar) — sama syarat dengan Dashboard utama:
  // butuh Client (baris "Internal" tidak pernah ditagih ke siapa-siapa).
  const slaRefs: BillingFollowUpRef[] = [
    ...domainRowsBase.filter((r) => r.clientId && r.bucket !== "safe").map((r) => ({ refType: "domain" as const, refId: r.id })),
    ...serverRowsBase.filter((r) => r.clientId).map((r) => ({ refType: "server" as const, refId: r.id })),
    ...maintenanceRowsBase.map((r) => ({ refType: "maintenance" as const, refId: r.id })),
  ]
  await ensureBillingFollowUps(prisma, slaRefs)
  const activeFollowUps =
    slaRefs.length > 0 ? await prisma.billingFollowUp.findMany({ where: { paidRecordedAt: null, OR: slaRefs.map((r) => ({ refType: r.refType, refId: r.refId })) } }) : []
  const followUpByRef = new Map(activeFollowUps.map((f) => [`${f.refType}:${f.refId}`, f]))

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

  const slaFor = (refType: BillingFollowUpRef["refType"], refId: string) => {
    const record = followUpByRef.get(`${refType}:${refId}`)
    const invoice = record?.invoiceId ? invoiceById.get(record.invoiceId) : undefined
    const latestPayment = invoice?.payments[0]
    return {
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
  }

  const domainRows: DomainRekapRow[] = domainRowsBase
    .map((r) => {
      const sla = r.clientId ? slaFor("domain", r.id).sla : null
      const status: DomainRekapRow["status"] = !sla
        ? "aktif"
        : sla.stage === "belum_ditagih" || sla.stage === "tagih_lagi"
          ? "belum_ditagih"
          : sla.stage === "menunggu_jawaban"
            ? "sudah_ditagih"
            : "belum_bayar"
      return { id: r.id, name: r.name, ownerLabel: r.ownerLabel, price: r.price, dueDate: r.dueDate, status, sortWeight: BUCKET_WEIGHT[r.bucket] }
    })
    .sort((a, b) => a.sortWeight - b.sortWeight || (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))

  const totalDomain = domainRows.length
  const belumTagih = domainRows.filter((r) => r.status === "belum_ditagih").length
  const sudahDitagih = domainRows.filter((r) => r.status === "sudah_ditagih" || r.status === "belum_bayar").length
  const belumBayar = domainRows.filter((r) => r.status === "belum_bayar").length

  // Distribusi jatuh tempo domain 12 bulan KE DEPAN (bukan histori — data histori bulanan tidak
  // disimpan) — pakai fungsi forecast yang sama dengan section Prediksi Pendapatan di bawah.
  const forecastMonths = buildRevenueForecast({
    domains: domainRowsBase.filter((d) => d.clientId).map((d) => ({ name: d.name, price: d.price ?? 0, expiry: d.dueDate ? new Date(d.dueDate) : null })),
    servers: [],
    maintenances: [],
    projectSchedules: [],
  })
  const domainTrend = forecastMonths.map((m) => ({ label: m.label, count: m.items.length }))

  // ---- Server & Maintenance — dipakai komponen yang SAMA dengan Dashboard utama, jadi cuma
  // menampilkan yang lagi due (lewat/bulan ini/bulan depan), bukan semua seperti Domain di atas.
  const serverDueRows: ServerDueRow[] = serverRowsBase
    .filter((r) => r.bucket === "expired" || r.bucket === "expiring_this_month")
    .map((r) => ({ ...r, ...slaFor("server", r.id) }))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))

  const maintenanceDueRows: MaintenanceDueRow[] = maintenanceRowsBase
    .filter((r) => r.dueDate !== null)
    .map((r) => ({ ...r, ...slaFor("maintenance", r.id) }))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))

  // ---- Project Tagihan (termin) ---------------------------------------
  const projectTagihanRows: ProjectTagihanRow[] = projectSchedules
    .map((s) => {
      const paid = s.invoice ? s.invoice.payments.reduce((sum, p) => sum + p.amount, 0) : 0
      const latestPayment = s.invoice?.payments[0]
      return {
        scheduleId: s.id,
        invoiceId: s.invoice?.id ?? null,
        invoiceNumber: s.invoice?.invoiceNumber ?? null,
        invoicedAt: s.invoice ? s.invoice.issuedAt.toISOString() : null,
        paidAt: latestPayment ? latestPayment.paidAt.toISOString() : null,
        paymentId: latestPayment?.payment?.id ?? null,
        paymentNumber: latestPayment?.payment?.paymentNumber ?? null,
        paymentPostStatus: latestPayment?.payment?.postStatus ?? null,
        projectId: s.project.id,
        projectName: s.project.name,
        clientId: s.project.clientId,
        clientName: s.project.client.name,
        picPhone: s.project.picPhone,
        label: s.label,
        dueDate: s.dueDate.toISOString(),
        remaining: s.invoice ? Math.max(0, s.invoice.totalAmount - paid) : s.amount,
        bucket: getExpiryBucket(s.dueDate),
      }
    })
    .filter((r) => r.remaining > 0 && (r.bucket === "expired" || r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month"))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  // ---- Prediksi Pendapatan — gabungan Domain/Server/Maintenance/Proyek 12 bulan ke depan, sama
  // logic dengan RevenueForecastSection di Dashboard utama. Domain/Server TANPA clientId adalah
  // infra internal 7Smarts (biaya, bukan pendapatan) — dikecualikan.
  const revenueForecast = buildRevenueForecast({
    domains: domains.filter((d) => d.clientId).map((d) => ({ name: `${d.name}${d.client ? ` — ${d.client.name}` : ""}`, price: d.sellPrice ?? 0, expiry: resolveDomainExpiry(d) })),
    servers: servers
      .filter((s) => s.clientId)
      .map((s) => ({
        name: `${s.name}${s.client ? ` — ${s.client.name}` : ""}`,
        price: s.price ?? 0,
        nextDue: resolveServerExpiry(s),
        periodMonths: periodNameToMonths(s.period?.name ?? "Tahunan") * (s.periodCount && s.periodCount > 0 ? s.periodCount : 1),
      })),
    maintenances: maintenances.map((m) => ({
      name: `${m.name}${m.client ? ` — ${m.client.name}` : ""}`,
      price: m.price ?? 0,
      nextDue: computeNextDueDate(m.lastPaidAt, m.period?.name, m.periodCount),
      periodMonths: periodNameToMonths(m.period?.name ?? "Bulanan") * (m.periodCount && m.periodCount > 0 ? m.periodCount : 1),
    })),
    projectSchedules: forecastProjectSchedules.map((s) => ({ name: `${s.project.name} — ${s.label}`, amount: s.amount, dueDate: s.dueDate })),
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard href="#domain" icon={Globe} iconClass="bg-sky-500/15 text-sky-700" label="Domain" value={totalDomain} hint={`${belumTagih} belum tagih`} />
        <SummaryCard href="#server" icon={ServerIcon} iconClass="bg-violet-500/15 text-violet-700" label="Server" value={servers.length} hint={`${serverDueRows.length} jatuh tempo`} />
        <SummaryCard href="#maintenance" icon={Wrench} iconClass="bg-fuchsia-500/15 text-fuchsia-700" label="Maintenance" value={maintenances.length} hint={`${maintenanceDueRows.length} jatuh tempo`} />
        <SummaryCard href="#tagihan-project" icon={FolderKanban} iconClass="bg-emerald-500/15 text-emerald-700" label="Proyek" value={projectTagihanRows.length} hint="termin perlu ditagih" />
      </div>

      <Link href="#prediksi">
        <Card variant="feature" padding="md" hoverable>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-5 h-5" /></span>
              <div>
                <p className="text-sm font-bold text-slate-700">Prediksi Pendapatan</p>
                <p className="text-[11px] text-slate-500 font-semibold">Gabungan Domain/Server/Maintenance/Proyek, 12 bulan ke depan.</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </Card>
      </Link>

      <div id="domain" className="scroll-mt-[150px]">
        <DomainRekapSection rows={domainRows} total={totalDomain} belumTagih={belumTagih} sudahDitagih={sudahDitagih} belumBayar={belumBayar} trend={domainTrend} />
      </div>
      <div id="server" className="scroll-mt-[150px]">
        <ServerDueSection rows={serverDueRows} clients={clientOptions} accounts={accounts} isOwner={isOwner} />
      </div>
      <div id="maintenance" className="scroll-mt-[150px]">
        <MaintenanceDueSection rows={maintenanceDueRows} />
      </div>
      <div id="tagihan-project" className="scroll-mt-[150px]">
        <ProjectTagihanSection rows={projectTagihanRows} />
      </div>
      <div id="prediksi" className="scroll-mt-[150px]">
        <RevenueForecastSection months={revenueForecast} />
      </div>
    </div>
  )
}
