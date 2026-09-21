import { prisma } from "@/lib/prisma"
import { resolveDomainExpiry, getExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket, resolveServerExpiry } from "@/lib/recurring-bill-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"
import { jakartaRangeFromToday } from "@/lib/datetime"
import { invoiceCashDue } from "@/lib/invoice-due"

// TEMPORARY: sama dengan src/app/dashboard/page.tsx — Maintenance "Blesscom" dikecualikan dari
// nominal "Tagihan Belum Ditagih" (pencatatan & alur penagihannya beda, belum ada menu khusus).
// HAPUS baris ini begitu menu Tagihan Blesscom ada — sama-sama di dua tempat ini.
const TEMP_EXCLUDED_BELUM_DITAGIH_IDS = new Set(["03d9eb5f-ffdb-4b48-9107-a85ce8de5c24"])

export interface FinanceTopStats {
  totalOutstanding: number
  totalHeld: number
  pendingHeldCount: number
  doubtfulHeldCount: number
  belumDitagihNominal: number
  domainExpiringThisMonth: number
  domainExpiringNextMonth: number
  billOverdue: number
  billDueSoon: number
}

/** 4 angka kartu ringkasan atas Dashboard (Piutang Outstanding, Tagihan Belum Ditagih, Domain
 *  Habis Bulan Ini/Depan, Biaya Berkala Jatuh Tempo) — diekstrak biar bisa dipakai ulang di
 *  Monitoring Keuangan > Uang Masuk tanpa query gede-gedean dobel.
 *
 *  CATATAN: logic ini sengaja MASIH DUPLIKAT dengan perhitungan inline di
 *  src/app/dashboard/page.tsx (bukan dipanggil balik dari situ), supaya tidak menyentuh halaman
 *  Dashboard utama yang sensitif & sering diubah paralel. Kalau salah satu logic-nya berubah,
 *  cek dan samakan yang satu lagi. */
export async function getFinanceTopStats(): Promise<FinanceTopStats> {
  // H-3 dari dueDate — sama ambang batas dengan cron auto-invoice & kartu ini di Dashboard.
  const projectUninvoicedThreshold = jakartaRangeFromToday(3).end

  const [openInvoices, heldInvoices, domains, servers, maintenances, bills, projectUninvoicedSchedules] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] }, postStatus: "posted", doubtfulAt: null, pendingAt: null },
      select: { totalAmount: true, payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] }, select: { amount: true } } },
    }),
    prisma.invoice.findMany({
      where: { postStatus: "posted", OR: [{ doubtfulAt: { not: null } }, { pendingAt: { not: null } }] },
      select: {
        pendingAt: true,
        totalAmount: true,
        ppnAmount: true,
        ppnEnabled: true,
        client: { select: { isPemungutPpn: true } },
        payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] }, select: { amount: true } },
      },
    }),
    prisma.domain.findMany({ where: { active: true, doubtfulAt: null, pendingAt: null }, select: { id: true, clientId: true, sellPrice: true, expiryDate: true, lastPaidAt: true } }),
    prisma.server.findMany({
      where: { active: true, doubtfulAt: null, pendingAt: null },
      select: { id: true, clientId: true, price: true, lastPaidAt: true, expiryDate: true, period: true, periodCount: true },
    }),
    prisma.maintenance.findMany({ where: { active: true }, select: { id: true, clientId: true, price: true, lastPaidAt: true, period: true, periodCount: true } }),
    prisma.recurringBill.findMany({ where: { active: true }, select: { lastPaidAt: true, periodCount: true, period: true } }),
    prisma.projectPaymentSchedule.findMany({
      where: { invoiceId: null, dueDate: { lte: projectUninvoicedThreshold }, project: { status: "berjalan" } },
      select: { amount: true },
    }),
  ])

  const totalOutstanding = openInvoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    return sum + Math.max(0, inv.totalAmount - paid)
  }, 0)

  const heldRows = heldInvoices
    .map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      return { remaining: Math.max(0, invoiceCashDue(inv, inv.client.isPemungutPpn) - paid), isPending: Boolean(inv.pendingAt) }
    })
    .filter((r) => r.remaining > 0)
  const pendingHeldCount = heldRows.filter((r) => r.isPending).length
  const doubtfulHeldCount = heldRows.length - pendingHeldCount
  const totalHeld = heldRows.reduce((sum, r) => sum + r.remaining, 0)

  const domainBuckets = domains.map((d) => getExpiryBucket(resolveDomainExpiry(d)))
  const domainExpiringThisMonth = domainBuckets.filter((b) => b === "expiring_this_month").length
  const domainExpiringNextMonth = domainBuckets.filter((b) => b === "expiring_next_month").length

  const billBuckets = bills.map((b) => getDueBucket(computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount), b.period?.reminderDaysBefore ?? 7))
  const billOverdue = billBuckets.filter((b) => b === "overdue").length
  const billDueSoon = billBuckets.filter((b) => b === "due_soon").length

  // Belum Ditagih nominal: domain/server/maintenance yang lagi due DAN punya Client, SLA-nya
  // masih tahap belum_ditagih/tagih_lagi — sama syarat dengan section Domain/Server/Maintenance
  // di Dashboard.
  const dueItems = [
    ...domains
      .map((d) => ({ id: d.id, clientId: d.clientId, price: d.sellPrice, bucket: getExpiryBucket(resolveDomainExpiry(d)), refType: "domain" as const }))
      .filter((d) => d.clientId && d.bucket !== "safe"),
    ...servers
      .map((s) => ({ id: s.id, clientId: s.clientId, price: s.price, bucket: getExpiryBucket(resolveServerExpiry(s)), refType: "server" as const }))
      .filter((s) => s.clientId && (s.bucket === "expired" || s.bucket === "expiring_this_month")),
    ...maintenances
      .map((m) => ({ id: m.id, clientId: m.clientId, price: m.price, bucket: getExpiryBucket(computeNextDueDate(m.lastPaidAt, m.period?.name, m.periodCount)), refType: "maintenance" as const }))
      .filter((m) => m.bucket === "expiring_this_month" || m.bucket === "expired"),
  ]
  const slaRefs: BillingFollowUpRef[] = dueItems.map((r) => ({ refType: r.refType, refId: r.id }))
  await ensureBillingFollowUps(prisma, slaRefs)
  const activeFollowUps = slaRefs.length > 0 ? await prisma.billingFollowUp.findMany({ where: { paidRecordedAt: null, OR: slaRefs.map((r) => ({ refType: r.refType, refId: r.refId })) } }) : []
  const followUpByRef = new Map(activeFollowUps.map((f) => [`${f.refType}:${f.refId}`, f]))

  const belumDitagihNominal =
    dueItems
      .filter((r) => !TEMP_EXCLUDED_BELUM_DITAGIH_IDS.has(r.id))
      .filter((r) => {
        const record = followUpByRef.get(`${r.refType}:${r.id}`)
        const sla = record ? computeSlaStatus(record) : null
        return sla?.stage === "belum_ditagih" || sla?.stage === "tagih_lagi"
      })
      .reduce((sum, r) => sum + (r.price ?? 0), 0) + projectUninvoicedSchedules.reduce((sum, s) => sum + s.amount, 0)

  return {
    totalOutstanding,
    totalHeld,
    pendingHeldCount,
    doubtfulHeldCount,
    belumDitagihNominal,
    domainExpiringThisMonth,
    domainExpiringNextMonth,
    billOverdue,
    billDueSoon,
  }
}
