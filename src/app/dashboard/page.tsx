import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription, Button } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeDomainExpiryDate, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"
import {
  PiutangSummarySection,
  RecurringDueSection,
  DomainExpiringSection,
  ServerDueSection,
  type PiutangSummaryRow,
  type RecurringDueRow,
  type DomainExpiringRow,
  type ServerDueRow,
} from "@/components/dashboard/DashboardSections"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function byDueDateAsc<T extends { dueDate: string | null }>(a: T, b: T) {
  const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
  const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
  return aTime - bTime
}

export default async function DashboardPage() {
  const user = await getCurrentUser()

  const [clientCount, domains, servers, bills, openInvoices] = await Promise.all([
    prisma.client.count(),
    prisma.domain.findMany({ where: { active: true }, include: { client: true } }),
    prisma.server.findMany({ where: { active: true }, include: { period: true, client: true } }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true, vendor: true } }),
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] } },
      include: { client: true, payments: true },
      orderBy: { dueDate: "asc" },
    }),
  ])

  const domainBuckets = domains.map((d) => getExpiryBucket(computeDomainExpiryDate(d.lastPaidAt)))
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
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.client.name,
        picName: inv.client.picName,
        picPhone: inv.client.picPhone || inv.client.phoneNumber,
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
  const domainExpiringRows: DomainExpiringRow[] = domains
    .map((d) => {
      const expiry = computeDomainExpiryDate(d.lastPaidAt)
      return {
        id: d.id,
        name: d.name,
        owner: d.client?.name ?? "Internal",
        clientId: d.clientId,
        clientPhone: d.client ? d.client.picPhone || d.client.phoneNumber : null,
        price: d.sellPrice,
        dueDate: expiry ? expiry.toISOString() : null,
        bucket: getExpiryBucket(expiry),
      }
    })
    .filter((r) => r.bucket === "expired" || r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
    .sort(byDueDateAsc)

  // Server: sudah lewat tempo, jatuh tempo bulan ini, atau jatuh tempo bulan depan.
  const serverDueRows: ServerDueRow[] = servers
    .map((s) => {
      const nextDue = computeNextDueDate(s.lastPaidAt, s.period?.name, s.periodCount)
      return {
        id: s.id,
        name: s.name,
        clientId: s.clientId,
        clientName: s.client?.name ?? null,
        clientPhone: s.client ? s.client.picPhone || s.client.phoneNumber : null,
        price: s.price,
        dueDate: nextDue ? nextDue.toISOString() : null,
        bucket: getExpiryBucket(nextDue),
      }
    })
    .filter((r) => r.bucket === "expired" || r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
    .sort(byDueDateAsc)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Ringkasan operasional hari ini.</p>
        </div>

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

        {domainExpired > 0 && (
          <Card variant="feature" padding="md" className="border-rose-300/60">
            <p className="text-sm font-bold text-rose-700">
              {domainExpired} domain sudah lewat masa aktifnya
              {user.role === "owner" ? " — cek Pengaturan > Master Data." : "."}
            </p>
          </Card>
        )}

        <PiutangSummarySection rows={piutangRows} />
        <RecurringDueSection rows={recurringDueRows} />
        <DomainExpiringSection rows={domainExpiringRows} />
        <ServerDueSection rows={serverDueRows} />

        <Card variant="panel" padding="lg">
          <p className="text-sm text-slate-600 font-medium">
            Domain &amp; Biaya Berkala sekarang dikelola di Pengaturan &gt; Master Data (khusus Owner).
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <Link href="/piutang">
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
