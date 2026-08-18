import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveDomainExpiry, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, resolveServerExpiry } from "@/lib/recurring-bill-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"

interface PendingItem {
  id: string
  type: "domain" | "server" | "maintenance"
  name: string
  price: number
  dueDate: string | null
  bucket: ExpiryBucket
}

const isDue = (bucket: ExpiryBucket) => bucket === "expired" || bucket === "expiring_this_month" || bucket === "expiring_next_month"

/** Domain/Server/Maintenance milik 1 Client yang lagi jatuh tempo (sama kriteria dengan Dashboard)
 *  TAPI belum pernah ditagih (SLA masih tahap "belum_ditagih") — dipakai form Buat Invoice biar
 *  staf bisa langsung "manggil" item-item ini jadi baris invoice tanpa bolak-balik ke Dashboard. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id: clientId } = await params

  const [domains, servers, maintenances] = await Promise.all([
    prisma.domain.findMany({ where: { active: true, clientId } }),
    prisma.server.findMany({ where: { active: true, clientId }, include: { period: true } }),
    prisma.maintenance.findMany({ where: { active: true, clientId }, include: { period: true } }),
  ])

  const domainRows: PendingItem[] = domains
    .map((d) => {
      const expiry = resolveDomainExpiry(d)
      return { id: d.id, type: "domain" as const, name: d.name, price: d.sellPrice ?? 0, dueDate: expiry ? expiry.toISOString() : null, bucket: getExpiryBucket(expiry) }
    })
    .filter((r) => isDue(r.bucket))

  const serverRows: PendingItem[] = servers
    .map((s) => {
      const nextDue = resolveServerExpiry(s)
      return { id: s.id, type: "server" as const, name: s.name, price: s.price ?? 0, dueDate: nextDue ? nextDue.toISOString() : null, bucket: getExpiryBucket(nextDue) }
    })
    .filter((r) => isDue(r.bucket))

  const maintenanceRows: PendingItem[] = maintenances
    .map((m) => {
      const nextDue = computeNextDueDate(m.lastPaidAt, m.period?.name, m.periodCount)
      return { id: m.id, type: "maintenance" as const, name: m.name, price: m.price ?? 0, dueDate: nextDue ? nextDue.toISOString() : null, bucket: getExpiryBucket(nextDue) }
    })
    .filter((r) => isDue(r.bucket))

  const allRows = [...domainRows, ...serverRows, ...maintenanceRows]
  const refs: BillingFollowUpRef[] = allRows.map((r) => ({ refType: r.type, refId: r.id }))
  await ensureBillingFollowUps(prisma, refs)
  const activeFollowUps =
    refs.length > 0 ? await prisma.billingFollowUp.findMany({ where: { paidRecordedAt: null, OR: refs.map((r) => ({ refType: r.refType, refId: r.refId })) } }) : []
  const followUpByRef = new Map(activeFollowUps.map((f) => [`${f.refType}:${f.refId}`, f]))

  const stillPending = (r: PendingItem) => {
    const record = followUpByRef.get(`${r.type}:${r.id}`)
    if (!record) return true
    const stage = computeSlaStatus(record)?.stage
    return stage === "belum_ditagih" || stage === "tagih_lagi"
  }

  return NextResponse.json({
    domains: domainRows.filter(stillPending),
    servers: serverRows.filter(stillPending),
    maintenances: maintenanceRows.filter(stillPending),
  })
}
