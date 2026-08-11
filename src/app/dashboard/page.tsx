import Link from "next/link"
import { redirect } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription, Button } from "@/components/ui"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveDomainExpiry, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { jakartaRangeFromToday } from "@/lib/datetime"
import { computeNextDueDate, getDueBucket, resolveServerExpiry, periodNameToMonths } from "@/lib/recurring-bill-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"
import { buildRevenueForecast } from "@/lib/revenue-forecast"
import {
  PiutangSummarySection,
  DomainExpiringSection,
  ServerDueSection,
  MaintenanceDueSection,
  type PiutangSummaryRow,
  type PiutangHistoryRow,
  type DomainExpiringRow,
  type ServerDueRow,
  type MaintenanceDueRow,
} from "@/components/dashboard/DashboardSections"
import { ProjectTagihanSection, type ProjectTagihanRow } from "@/components/dashboard/ProjectTagihanSection"
import { RevenueForecastSection } from "@/components/dashboard/RevenueForecastSection"
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

  // Termin project yang sudah waktunya ditagih (H-3 dari dueDate, sama ambang batas dengan cron
  // auto-invoice) tapi entah kenapa belum ada invoice-nya — dipakai buat kartu "Tagihan Belum
  // Ditagih" di bawah, bareng Domain/Server/Maintenance yang statusnya masih "belum_ditagih".
  const projectUninvoicedThreshold = jakartaRangeFromToday(3).end

  const [
    projectUninvoicedSchedules,
    clientOptions,
    accounts,
    domains,
    servers,
    maintenances,
    bills,
    openInvoices,
    followUps,
    projectSchedules,
    forecastProjectSchedules,
  ] = await Promise.all([
    prisma.projectPaymentSchedule.findMany({
      where: { invoiceId: null, dueDate: { lte: projectUninvoicedThreshold }, project: { status: "berjalan" } },
      select: { amount: true },
    }),
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
      // Reminder Dashboard: termin yang SUDAH ditagih tapi belum lunas, ATAU yang BELUM
      // ditagih sama sekali (invoiceId null) — dua-duanya tetap perlu diingatkan, difilter
      // ke bucket bulan ini/depan/lewat di bawah (sama pola dengan Domain/Server/Maintenance).
      where: { project: { status: "berjalan" }, OR: [{ invoiceId: null }, { invoice: { status: { in: ["unpaid", "partial"] } } }] },
      include: {
        project: { include: { client: true } },
        invoice: { include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } } },
      },
    }),
    prisma.projectPaymentSchedule.findMany({
      where: { project: { status: "berjalan" } },
      select: { amount: true, dueDate: true, label: true, project: { select: { name: true } } },
    }),
  ])

  // Siklus log histori follow-up (lihat billing-follow-up.ts) punya tiap invoice piutang di
  // atas — dipakai tombol "Input Respon" di section Piutang, dicocokkan lewat invoiceId.
  const piutangBillingFollowUps = await prisma.billingFollowUp.findMany({
    where: { invoiceId: { in: openInvoices.map((inv) => inv.id) } },
    select: { id: true, invoiceId: true },
  })
  const billingFollowUpIdByInvoiceId = new Map(piutangBillingFollowUps.map((f) => [f.invoiceId as string, f.id]))

  // Histori Respon per invoice piutang — ditampilkan sebagai tabel di dalam card client masing-
  // masing (Dashboard > Piutang), bukan cuma di modal "Input Respon" seperti sebelumnya.
  const followUpIds = piutangBillingFollowUps.map((f) => f.id)
  const followUpResponses =
    followUpIds.length > 0
      ? await prisma.billingFollowUpResponse.findMany({ where: { billingFollowUpId: { in: followUpIds } }, orderBy: { createdAt: "desc" } })
      : []
  const responseUserIds = [...new Set(followUpResponses.map((r) => r.createdById))]
  const responseUsers =
    responseUserIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: responseUserIds } }, select: { id: true, name: true } }) : []
  const responseUserNameById = new Map(responseUsers.map((u) => [u.id, u.name]))
  const invoiceIdByFollowUpId = new Map(piutangBillingFollowUps.map((f) => [f.id, f.invoiceId as string]))
  const openInvoiceById = new Map(openInvoices.map((inv) => [inv.id, inv]))

  const piutangHistoryRows: PiutangHistoryRow[] = followUpResponses
    .map((r) => {
      const invoiceId = invoiceIdByFollowUpId.get(r.billingFollowUpId)
      const invoice = invoiceId ? openInvoiceById.get(invoiceId) : undefined
      if (!invoice) return null
      return {
        id: r.id,
        clientId: invoice.client.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        responseType: r.responseType,
        note: r.note,
        promisedPayAt: r.promisedPayAt ? r.promisedPayAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        createdByName: responseUserNameById.get(r.createdById) ?? "-",
      }
    })
    .filter((r): r is PiutangHistoryRow => r !== null)

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
        billingFollowUpId: billingFollowUpIdByInvoiceId.get(inv.id) ?? null,
      }
    })
    .filter((r) => r.remaining > 0)
    .sort(byDueDateAsc)

  const totalOutstanding = piutangRows.reduce((sum, r) => sum + r.remaining, 0)

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

  // Maintenance: sudah lewat tempo, jatuh tempo bulan ini, atau bulan depan — sama pola
  // dengan Domain/Server (dulu sengaja cuma "bulan ini", sekarang disamakan).
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
    .filter((r) => r.bucket === "expired" || r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
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

  // Kartu "Tagihan Belum Ditagih": total NOMINAL Domain/Server/Maintenance yang SLA-nya masih
  // tahap belum_ditagih, ditambah termin Project yang sudah lewat ambang H-3 tapi belum
  // di-generate invoice-nya (projectUninvoicedSchedules, lihat query di atas).
  const belumDitagihNominal =
    [...domainExpiringRows, ...serverDueRows, ...maintenanceDueRows]
      .filter((r) => r.sla?.stage === "belum_ditagih")
      .reduce((sum, r) => sum + (r.price ?? 0), 0) +
    projectUninvoicedSchedules.reduce((sum, s) => sum + s.amount, 0)

  // Tagihan Termin Project: reminder, cuma tampil kalau jatuh tempo sudah lewat, bulan ini,
  // atau bulan depan (sama pola dengan Domain/Server/Maintenance) — mencakup termin yang
  // sudah jadi invoice (tapi belum lunas) MAUPUN yang belum sempat ditagih sama sekali.
  const projectTagihanRows: ProjectTagihanRow[] = projectSchedules
    .map((s) => {
      const paid = s.invoice ? s.invoice.payments.reduce((sum, p) => sum + p.amount, 0) : 0
      return {
        scheduleId: s.id,
        invoiceId: s.invoice?.id ?? null,
        invoiceNumber: s.invoice?.invoiceNumber ?? null,
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

  // Prediksi pendapatan 6 bulan ke depan dari siklus renewal Domain (tahunan)/Server/Maintenance
  // (sesuai BillingPeriod-nya) + jadwal termin Project — lihat buildRevenueForecast untuk detail
  // asumsinya (item aktif dianggap diperpanjang tepat waktu, bukan angka pasti). Domain/Server
  // TANPA clientId adalah infra/langganan internal 7Smarts (mis. Zoom, Google Drive, VPS kantor)
  // — itu biaya, bukan pendapatan, jadi WAJIB dikecualikan di sini walau harganya (price/sellPrice)
  // terisi. Maintenance selalu punya clientId (lihat schema), tidak perlu filter serupa.
  const revenueForecast = buildRevenueForecast({
    domains: domains
      .filter((d) => d.clientId)
      .map((d) => ({ name: `${d.name}${d.client ? ` — ${d.client.name}` : ""}`, price: d.sellPrice ?? 0, expiry: resolveDomainExpiry(d) })),
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

  const followUpRows = followUps.map((f) => ({
    id: f.id,
    subject: f.subject,
    note: f.note,
    followUpDate: f.followUpDate.toISOString(),
  }))

  const navBadges: DashboardNavBadge[] = [
    { label: "SLA Lewat", href: "/laporan/tindak-lanjut-tagihan", count: slaOverdueCount, color: "rose" },
    { label: "Prediksi", href: "#prediksi", count: revenueForecast.length, color: "emerald" },
    { label: "Piutang", href: "#piutang", count: piutangRows.length, color: "rose" },
    { label: "Domain", href: "#domain", count: domainExpiringRows.length, color: "sky" },
    { label: "Server", href: "#server", count: serverDueRows.length, color: "violet" },
    { label: "Maintenance", href: "#maintenance", count: maintenanceDueRows.length, color: "fuchsia" },
    { label: "Tagihan Project", href: "#tagihan-project", count: projectTagihanRows.length, color: "indigo" },
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
            <CardDescription>Tagihan yang Belum Ditagih</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">{formatRupiah(belumDitagihNominal)}</p>
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
          <PiutangSummarySection rows={piutangRows} historyRows={piutangHistoryRows} />
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

        <div id="prediksi" className="scroll-mt-[150px]">
          <RevenueForecastSection months={revenueForecast} />
        </div>
      </div>
    </AppLayout>
  )
}
