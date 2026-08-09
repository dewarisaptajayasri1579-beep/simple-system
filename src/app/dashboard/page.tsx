import Link from "next/link"
import { redirect } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription, Button } from "@/components/ui"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveDomainExpiry, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket, resolveServerExpiry } from "@/lib/recurring-bill-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"
import {
  PiutangSummarySection,
  RecurringDueSection,
  DomainExpiringSection,
  ServerDueSection,
  MaintenanceDueSection,
  type PiutangSummaryRow,
  type RecurringDueRow,
  type DomainExpiringRow,
  type ServerDueRow,
  type MaintenanceDueRow,
} from "@/components/dashboard/DashboardSections"
import { ProjectTagihanSection, type ProjectTagihanRow } from "@/components/dashboard/ProjectTagihanSection"
import { DashboardNavBadges, type DashboardNavBadge } from "@/components/dashboard/DashboardNavBadges"
import { FollowUpPanel } from "@/components/follow-up/FollowUpPanel"
import { SendWhatsappReportButton } from "@/components/dashboard/SendWhatsappReportButton"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function byDueDateAsc<T extends { dueDate: string | null }>(a: T, b: T) {
  const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
  const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
  return aTime - bTime
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ quick?: string }> }) {
  const params = await searchParams
  // Link laporan WA (?quick=1) redirect ke modal "Login sebagai siapa?", bukan form password
  // biasa — WA tidak bisa kasih tahu ini diklik dari nomor siapa (lihat QuickLoginModal).
  const user = await getSessionUser()
  if (!user) redirect(params.quick === "1" ? "/login?quick=1" : "/login")

  const [clientCount, clientOptions, accounts, domains, servers, maintenances, bills, openInvoices, followUps, projectSchedules] = await Promise.all([
    prisma.client.count(),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.domain.findMany({ where: { active: true }, include: { client: true } }),
    prisma.server.findMany({ where: { active: true }, include: { period: true, client: true } }),
    prisma.maintenance.findMany({ where: { active: true }, include: { period: true, client: true } }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true, vendor: true } }),
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] }, postStatus: "posted" },
      include: {
        client: true,
        payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.followUp.findMany({ orderBy: { followUpDate: "desc" } }),
    prisma.projectPaymentSchedule.findMany({
      where: { invoiceId: { not: null }, invoice: { status: { in: ["unpaid", "partial"] } } },
      include: {
        project: { include: { client: true } },
        invoice: { include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } } },
      },
    }),
  ])

  const domainBuckets = domains.map((d) => getExpiryBucket(resolveDomainExpiry(d)))
  const domainExpiringThisMonth = domainBuckets.filter((b) => b === "expiring_this_month").length
  const domainExpiringNextMonth = domainBuckets.filter((b) => b === "expiring_next_month").length
  const domainExpired = domainBuckets.filter((b) => b === "expired").length

  const billBuckets = bills.map((b) => getDueBucket(computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount), b.period?.reminderDaysBefore ?? 7))
  const billOverdue = billBuckets.filter((b) => b === "overdue").length
  const billDueSoon = billBuckets.filter((b) => b === "due_soon").length

  // Piutang Penjualan: semua invoice yang masih ada sisa tagihan, jatuh tempo terdekat dulu.
  const piutangRows: PiutangSummaryRow[] = openInvoices
    .map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      return {
        id: inv.id,
        clientId: inv.client.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.client.name,
        picName: inv.client.picName,
        picPhone: inv.client.picPhone || inv.client.phoneNumber,
        issuedAt: inv.issuedAt.toISOString(),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        remaining: Math.max(0, inv.totalAmount - paid),
        status: inv.status,
      }
    })
    .filter((r) => r.remaining > 0)
    .sort(byDueDateAsc)

  const totalOutstanding = piutangRows.reduce((sum, r) => sum + r.remaining, 0)

  // Pembayaran Rutin: biaya berkala yang jatuh tempo bulan ini (kalender), plus yang sudah lewat tempo.
  const recurringDueRows: RecurringDueRow[] = bills
    .map((b) => {
      const nextDue = computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount)
      return {
        id: b.id,
        name: b.name,
        identifier: b.identifier,
        category: b.category,
        vendorName: b.vendor?.name ?? null,
        price: b.price,
        dueDate: nextDue ? nextDue.toISOString() : null,
        bucket: getExpiryBucket(nextDue),
      }
    })
    .filter((r) => r.bucket === "expiring_this_month" || r.bucket === "expired")
    .sort(byDueDateAsc)

  // Domain: sudah lewat tempo, habis bulan ini, atau habis bulan depan.
  const domainExpiringRowsBase = domains
    .map((d) => {
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
      }
    })
    .filter((r) => r.bucket === "expired" || r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
    .sort(byDueDateAsc)

  // Server: sudah lewat tempo, jatuh tempo bulan ini, atau jatuh tempo bulan depan.
  const serverDueRowsBase = servers
    .map((s) => {
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
      }
    })
    .filter((r) => r.bucket === "expired" || r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
    .sort(byDueDateAsc)

  // Maintenance: sudah lewat tempo atau jatuh tempo bulan ini saja (beda dari Domain/Server,
  // sengaja tidak ikut nampilin "bulan depan" di sini).
  const maintenanceDueRowsBase = maintenances
    .map((m) => {
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
    .filter((r) => r.bucket === "expired" || r.bucket === "expiring_this_month")
    .sort(byDueDateAsc)

  // SLA tindak-lanjut tagihan (lihat sop.txt/billing-follow-up.ts) — cuma buat Domain/Server yang
  // punya Client (baris "Internal" tidak pernah ditagih ke siapa-siapa) + Maintenance (selalu
  // punya Client). Pastikan siklus aktif ada, lalu ambil semuanya buat di-join ke row.
  const slaRefs: BillingFollowUpRef[] = [
    ...domainExpiringRowsBase.filter((r) => r.clientId).map((r) => ({ refType: "domain" as const, refId: r.id })),
    ...serverDueRowsBase.filter((r) => r.clientId).map((r) => ({ refType: "server" as const, refId: r.id })),
    ...maintenanceDueRowsBase.map((r) => ({ refType: "maintenance" as const, refId: r.id })),
  ]
  await ensureBillingFollowUps(prisma, slaRefs)
  const activeFollowUps =
    slaRefs.length > 0
      ? await prisma.billingFollowUp.findMany({ where: { paidRecordedAt: null, OR: slaRefs.map((r) => ({ refType: r.refType, refId: r.refId })) } })
      : []
  const followUpByRef = new Map(activeFollowUps.map((f) => [`${f.refType}:${f.refId}`, f]))
  const slaFor = (refType: BillingFollowUpRef["refType"], refId: string) => {
    const record = followUpByRef.get(`${refType}:${refId}`)
    return { billingFollowUpId: record?.id ?? null, invoiceId: record?.invoiceId ?? null, sla: record ? computeSlaStatus(record) : null }
  }

  const domainExpiringRows: DomainExpiringRow[] = domainExpiringRowsBase.map((r) => ({ ...r, ...slaFor("domain", r.id) }))
  const serverDueRows: ServerDueRow[] = serverDueRowsBase.map((r) => ({ ...r, ...slaFor("server", r.id) }))
  const maintenanceDueRows: MaintenanceDueRow[] = maintenanceDueRowsBase.map((r) => ({ ...r, ...slaFor("maintenance", r.id) }))
  const slaOverdueCount = [...domainExpiringRows, ...serverDueRows, ...maintenanceDueRows].filter((r) => r.sla?.overdue).length

  // Tagihan Termin Project: termin yang sudah jadi invoice tapi belum lunas.
  const projectTagihanRows: ProjectTagihanRow[] = projectSchedules
    .filter((s) => s.invoice)
    .map((s) => {
      const paid = s.invoice!.payments.reduce((sum, p) => sum + p.amount, 0)
      return {
        scheduleId: s.id,
        invoiceId: s.invoice!.id,
        invoiceNumber: s.invoice!.invoiceNumber,
        projectId: s.project.id,
        projectName: s.project.name,
        clientId: s.project.clientId,
        clientName: s.project.client.name,
        picPhone: s.project.picPhone,
        label: s.label,
        dueDate: s.dueDate.toISOString(),
        remaining: Math.max(0, s.invoice!.totalAmount - paid),
      }
    })
    .filter((r) => r.remaining > 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  // Follow Up: catatan yang jatuh tempo hari ini atau sudah lewat.
  const followUpRows = followUps.map((f) => ({
    id: f.id,
    subject: f.subject,
    note: f.note,
    followUpDate: f.followUpDate.toISOString(),
  }))
  const todayJakarta = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  const followUpDueCount = followUpRows.filter((r) => r.followUpDate.slice(0, 10) <= todayJakarta).length

  const navBadges: DashboardNavBadge[] = [
    { label: "SLA Lewat", href: "/laporan/tindak-lanjut-tagihan", count: slaOverdueCount, color: "rose" },
    { label: "Piutang", href: "#piutang", count: piutangRows.length, color: "rose" },
    { label: "Pembayaran Rutin", href: "#pembayaran-rutin", count: recurringDueRows.length, color: "amber" },
    { label: "Domain", href: "#domain", count: domainExpiringRows.length, color: "sky" },
    { label: "Server", href: "#server", count: serverDueRows.length, color: "violet" },
    { label: "Maintenance", href: "#maintenance", count: maintenanceDueRows.length, color: "fuchsia" },
    { label: "Tagihan Project", href: "#tagihan-project", count: projectTagihanRows.length, color: "indigo" },
    { label: "Follow Up", href: "#follow-up", count: followUpDueCount, color: "emerald" },
  ]

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Ringkasan operasional hari ini.</p>
          </div>
          <SendWhatsappReportButton />
        </div>

        <DashboardNavBadges items={navBadges} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <Card variant="feature" padding="md">
            <CardDescription>Piutang Outstanding</CardDescription>
            <p className="text-2xl font-black text-rose-700 mt-1">{formatRupiah(totalOutstanding)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Total Client</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">{clientCount}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Domain Habis Bulan Ini/Depan</CardDescription>
            <p className="text-2xl font-black text-amber-700 mt-1">{domainExpiringThisMonth + domainExpiringNextMonth}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Biaya Berkala Jatuh Tempo</CardDescription>
            <p className="text-2xl font-black text-amber-700 mt-1">{billOverdue + billDueSoon}</p>
          </Card>
        </div>

        <div id="piutang" className="scroll-mt-[150px]">
          <PiutangSummarySection rows={piutangRows} />
        </div>
        <div id="pembayaran-rutin" className="scroll-mt-[150px]">
          <RecurringDueSection rows={recurringDueRows} accounts={accounts} isOwner={user.role === "owner"} />
        </div>
        <div id="domain" className="scroll-mt-[150px]">
          <DomainExpiringSection rows={domainExpiringRows} clients={clientOptions} accounts={accounts} isOwner={user.role === "owner"} />
        </div>
        <div id="server" className="scroll-mt-[150px]">
          <ServerDueSection rows={serverDueRows} clients={clientOptions} accounts={accounts} isOwner={user.role === "owner"} />
        </div>
        <div id="maintenance" className="scroll-mt-[150px]">
          <MaintenanceDueSection rows={maintenanceDueRows} />
        </div>
        <div id="tagihan-project" className="scroll-mt-[150px]">
          <ProjectTagihanSection rows={projectTagihanRows} />
        </div>
        <div id="follow-up" className="scroll-mt-[150px]">
          <FollowUpPanel rows={followUpRows} />
        </div>

        <Card variant="panel" padding="lg">
          <p className="text-sm text-slate-600 font-medium">
            Domain &amp; Biaya Berkala sekarang dikelola di Pengaturan &gt; Master Data (khusus Owner).
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <Link href="/laporan/piutang">
              <Button variant="outline" size="sm">Lihat Piutang</Button>
            </Link>
            <Link href="/penjualan">
              <Button variant="outline" size="sm">Lihat Penjualan</Button>
            </Link>
            {user.role === "owner" && (
              <Link href="/pengaturan">
                <Button variant="outline" size="sm">Kelola Master Data</Button>
              </Link>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
