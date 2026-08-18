import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveDomainExpiry, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, resolveServerExpiry } from "@/lib/recurring-bill-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"

interface PendingItem {
  id: string
  type: "domain" | "server" | "maintenance" | "project_termin"
  name: string
  price: number
  dueDate: string | null
  bucket: ExpiryBucket
}

const isDue = (bucket: ExpiryBucket) => bucket === "expired" || bucket === "expiring_this_month" || bucket === "expiring_next_month"

/** Domain/Server/Maintenance milik 1 Client yang lagi jatuh tempo (sama kriteria dengan Dashboard)
 *  TAPI belum pernah ditagih (SLA masih tahap "belum_ditagih") — dipakai form Buat Invoice biar
 *  staf bisa langsung "manggil" item-item ini jadi baris invoice tanpa bolak-balik ke Dashboard.
 *
 *  `?all=true` — lepas filter jatuh tempo, buat kasus staf mau nagih LEBIH AWAL (belum due sama
 *  sekali). SENGAJA tidak ikut ensureBillingFollowUps buat item yang belum due: field itu men-stamp
 *  `dueAppearedAt = now` yang jadi basis deadline SLA (lihat computeSlaStatus) — kalau di-stempel
 *  sekarang padahal item-nya beneran baru due bulan depan, SLA-nya jadi kepencet lebih cepat dari
 *  seharusnya (overdue palsu). Item yang memang sudah due tetap lewat jalur lama (ensure + filter
 *  stillPending) supaya SLA-nya tidak berubah dari sebelumnya. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id: clientId } = await params
  const showAll = new URL(request.url).searchParams.get("all") === "true"

  const [domains, servers, maintenances, projectSchedules] = await Promise.all([
    prisma.domain.findMany({ where: { active: true, clientId } }),
    prisma.server.findMany({ where: { active: true, clientId }, include: { period: true } }),
    prisma.maintenance.findMany({ where: { active: true, clientId }, include: { period: true } }),
    prisma.projectPaymentSchedule.findMany({ where: { invoiceId: null, project: { clientId, status: "berjalan" } }, include: { project: true } }),
  ])

  const domainAll: PendingItem[] = domains.map((d) => {
    const expiry = resolveDomainExpiry(d)
    return { id: d.id, type: "domain" as const, name: d.name, price: d.sellPrice ?? 0, dueDate: expiry ? expiry.toISOString() : null, bucket: getExpiryBucket(expiry) }
  })
  const serverAll: PendingItem[] = servers.map((s) => {
    const nextDue = resolveServerExpiry(s)
    return { id: s.id, type: "server" as const, name: s.name, price: s.price ?? 0, dueDate: nextDue ? nextDue.toISOString() : null, bucket: getExpiryBucket(nextDue) }
  })
  const maintenanceAll: PendingItem[] = maintenances.map((m) => {
    const nextDue = computeNextDueDate(m.lastPaidAt, m.period?.name, m.periodCount)
    return { id: m.id, type: "maintenance" as const, name: m.name, price: m.price ?? 0, dueDate: nextDue ? nextDue.toISOString() : null, bucket: getExpiryBucket(nextDue) }
  })
  // Termin Project belum pernah punya invoice (invoiceId null) — TIDAK lewat ensureBillingFollowUps/
  // stillPending di bawah (itu buat siklus Domain/Server/Maintenance yang punya tahap "reminder").
  // Termin Project sengaja skip tahap reminder (lihat catatan BillingFollowUp di schema.prisma),
  // siklusnya baru mulai pas beneran diinvoice — dibikin manual di POST /api/invoices.
  const projectAll: PendingItem[] = projectSchedules.map((s) => ({
    id: s.id,
    type: "project_termin" as const,
    name: `${s.project.name} - ${s.label}`,
    price: s.amount,
    dueDate: s.dueDate.toISOString(),
    bucket: getExpiryBucket(s.dueDate),
  }))

  const domainDue = domainAll.filter((r) => isDue(r.bucket))
  const serverDue = serverAll.filter((r) => isDue(r.bucket))
  const maintenanceDue = maintenanceAll.filter((r) => isDue(r.bucket))
  const projectDue = projectAll.filter((r) => isDue(r.bucket))

  const dueRows = [...domainDue, ...serverDue, ...maintenanceDue]
  const refs: BillingFollowUpRef[] = dueRows.map((r) => ({ refType: r.type, refId: r.id }))
  await ensureBillingFollowUps(prisma, refs)
  const activeFollowUps =
    refs.length > 0 ? await prisma.billingFollowUp.findMany({ where: { paidRecordedAt: null, OR: refs.map((r) => ({ refType: r.refType, refId: r.refId })) } }) : []
  const followUpByRef = new Map(activeFollowUps.map((f) => [`${f.refType}:${f.refId}`, f]))

  // Default true kalau tidak ada record follow-up sama sekali — otomatis benar juga buat item
  // belum-due di mode `all` (tidak pernah di-ensure di atas, jadi memang tidak ada record-nya).
  const stillPending = (r: PendingItem) => {
    const record = followUpByRef.get(`${r.type}:${r.id}`)
    if (!record) return true
    const stage = computeSlaStatus(record)?.stage
    return stage === "belum_ditagih" || stage === "tagih_lagi"
  }

  return NextResponse.json({
    domains: (showAll ? domainAll : domainDue).filter(stillPending),
    servers: (showAll ? serverAll : serverDue).filter(stillPending),
    maintenances: (showAll ? maintenanceAll : maintenanceDue).filter(stillPending),
    projects: showAll ? projectAll : projectDue,
  })
}
