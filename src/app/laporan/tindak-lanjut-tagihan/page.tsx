import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription } from "@/components/ui"
import { BillingFollowUpList, type BillingFollowUpRow } from "@/components/billing-follow-up/BillingFollowUpList"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeSlaStatus, evaluateClosedCycle, SLA_STAGE_LABEL, type BillingFollowUpRefType } from "@/lib/billing-follow-up"

export default async function TindakLanjutTagihanPage() {
  const user = await getCurrentUser()

  const followUps = await prisma.billingFollowUp.findMany({ orderBy: { createdAt: "desc" } })

  const idsByType: Record<BillingFollowUpRefType, string[]> = { domain: [], server: [], maintenance: [], project_termin: [], invoice: [] }
  const invoiceIds: string[] = []
  for (const f of followUps) {
    idsByType[f.refType as BillingFollowUpRefType]?.push(f.refId)
    if (f.invoiceId) invoiceIds.push(f.invoiceId)
  }

  const [domains, servers, maintenances, invoices, schedules] = await Promise.all([
    prisma.domain.findMany({ where: { id: { in: idsByType.domain } }, select: { id: true, name: true, client: { select: { name: true } } } }),
    prisma.server.findMany({ where: { id: { in: idsByType.server } }, select: { id: true, name: true, client: { select: { name: true } } } }),
    prisma.maintenance.findMany({ where: { id: { in: idsByType.maintenance } }, select: { id: true, name: true, client: { select: { name: true } } } }),
    prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, invoiceNumber: true, client: { select: { name: true } } } }),
    prisma.projectPaymentSchedule.findMany({
      where: { id: { in: idsByType.project_termin } },
      select: { id: true, label: true, project: { select: { name: true, client: { select: { name: true } } } } },
    }),
  ])

  const itemByKey = new Map<string, { name: string; clientName: string | null }>()
  for (const d of domains) itemByKey.set(`domain:${d.id}`, { name: d.name, clientName: d.client?.name ?? null })
  for (const s of servers) itemByKey.set(`server:${s.id}`, { name: s.name, clientName: s.client?.name ?? null })
  for (const m of maintenances) itemByKey.set(`maintenance:${m.id}`, { name: m.name, clientName: m.client?.name ?? null })
  for (const s of schedules) itemByKey.set(`project_termin:${s.id}`, { name: `${s.project.name} — ${s.label}`, clientName: s.project.client.name })
  for (const inv of invoices) itemByKey.set(`invoice:${inv.id}`, { name: inv.invoiceNumber, clientName: inv.client.name })
  const invoiceNumberById = new Map(invoices.map((i) => [i.id, i.invoiceNumber]))

  const REF_TYPE_LABEL: Record<BillingFollowUpRefType, string> = {
    domain: "Domain",
    server: "Server",
    maintenance: "Maintenance",
    project_termin: "Termin Project",
    invoice: "Invoice Manual",
  }

  const rows: BillingFollowUpRow[] = followUps.map((f) => {
    const item = itemByKey.get(`${f.refType}:${f.refId}`)
    const sla = computeSlaStatus(f)

    let statusKey: BillingFollowUpRow["statusKey"]
    let statusLabel: string
    if (sla) {
      statusKey = sla.overdue ? "aktif_lewat" : "aktif_dalam_batas"
      statusLabel = sla.overdue ? `Aktif — lewat ${sla.daysOverdue} hari (${SLA_STAGE_LABEL[sla.stage]})` : `Aktif — ${SLA_STAGE_LABEL[sla.stage]}`
    } else {
      const evaluation = evaluateClosedCycle(f)
      const late = evaluation?.late ?? false
      statusKey = late ? "selesai_telat" : "selesai_tepat_waktu"
      statusLabel = late ? "Selesai — ada tahap telat" : "Selesai — tepat waktu"
    }

    return {
      id: f.id,
      refType: f.refType as BillingFollowUpRefType,
      refTypeLabel: REF_TYPE_LABEL[f.refType as BillingFollowUpRefType] ?? f.refType,
      itemName: item?.name ?? "(sudah dihapus)",
      clientName: item?.clientName ?? "-",
      invoiceNumber: f.invoiceId ? invoiceNumberById.get(f.invoiceId) ?? null : null,
      invoiceId: f.invoiceId,
      dueAppearedAt: f.dueAppearedAt ? f.dueAppearedAt.toISOString() : null,
      invoicedAt: f.invoicedAt ? f.invoicedAt.toISOString() : null,
      clientRespondedAt: f.clientRespondedAt ? f.clientRespondedAt.toISOString() : null,
      promisedPayAt: f.promisedPayAt ? f.promisedPayAt.toISOString() : null,
      paidRecordedAt: f.paidRecordedAt ? f.paidRecordedAt.toISOString() : null,
      statusKey,
      statusLabel,
    }
  })

  const totalCycles = rows.length
  const activeCount = rows.filter((r) => r.statusKey === "aktif_dalam_batas" || r.statusKey === "aktif_lewat").length
  const activeLateCount = rows.filter((r) => r.statusKey === "aktif_lewat").length
  const closedRows = rows.filter((r) => r.statusKey === "selesai_tepat_waktu" || r.statusKey === "selesai_telat")
  const closedOnTimeCount = closedRows.filter((r) => r.statusKey === "selesai_tepat_waktu").length
  const onTimePct = closedRows.length > 0 ? Math.round((closedOnTimeCount / closedRows.length) * 100) : null

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Tindak Lanjut Tagihan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Riwayat SLA penagihan Domain/Server/Maintenance/Termin Project/Invoice manual — dari muncul jatuh tempo sampai pembayaran diinput.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <Card variant="feature" padding="md">
            <CardDescription>Total Siklus</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalCycles}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Sedang Berjalan</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">{activeCount}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Sedang Lewat Deadline</CardDescription>
            <p className="text-2xl font-black text-rose-700 mt-1">{activeLateCount}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Selesai Tepat Waktu</CardDescription>
            <p className="text-2xl font-black text-emerald-700 mt-1">{onTimePct === null ? "-" : `${onTimePct}%`}</p>
          </Card>
        </div>

        <BillingFollowUpList rows={rows} />
      </div>
    </AppLayout>
  )
}
