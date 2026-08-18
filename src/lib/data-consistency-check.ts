import { prisma } from "@/lib/prisma"
import { invoiceCashDue } from "@/lib/invoice-due"

export type ConsistencySeverity = "error" | "warning"

export interface ConsistencyFinding {
  id: string
  checkLabel: string
  severity: ConsistencySeverity
  entityLabel: string
  description: string
  href: string | null
}

const AMOUNT_TOLERANCE = 1 // rupiah — toleransi pembulatan

/** Jurnal tidak balance — per JournalEntry, sum debit harus = sum credit di JournalLine-nya. Lihat
 *  Konsistensi-Data.md §2. Dicek untuk SEMUA postStatus (draft/posted/voided) — jurnal yang tidak
 *  balance itu bug struktural, terlepas dari status postingnya. */
async function checkJournalBalance(): Promise<ConsistencyFinding[]> {
  const entries = await prisma.journalEntry.findMany({
    include: { lines: { select: { debit: true, credit: true } } },
  })

  const findings: ConsistencyFinding[] = []
  for (const e of entries) {
    const debit = e.lines.reduce((sum, l) => sum + l.debit, 0)
    const credit = e.lines.reduce((sum, l) => sum + l.credit, 0)
    if (Math.abs(debit - credit) > AMOUNT_TOLERANCE) {
      findings.push({
        id: `journal-balance-${e.id}`,
        checkLabel: "Jurnal tidak balance",
        severity: "error",
        entityLabel: e.entryNumber,
        description: `Debit ${debit.toLocaleString("id-ID")} ≠ Kredit ${credit.toLocaleString("id-ID")} (selisih ${Math.abs(debit - credit).toLocaleString("id-ID")})`,
        href: `/akuntansi/jurnal?entryId=${e.id}`,
      })
    }
  }
  return findings
}

/** Total Invoice tidak cocok dengan sum baris item-nya. Invoice.subtotal itu SEBELUM diskon
 *  per-baris (lihat POST /api/invoices: `subtotal = sum(qty*unitPrice)`, beda dari
 *  `InvoiceLine.lineTotal` yang SUDAH dikurangi `discountAmount` baris itu) — jadi
 *  perbandingannya wajib pakai qty*unitPrice, bukan lineTotal, supaya invoice dengan diskon
 *  per-baris yang sah tidak salah kedeteksi jadi temuan. */
async function checkInvoiceTotals(): Promise<ConsistencyFinding[]> {
  const invoices = await prisma.invoice.findMany({ include: { lines: { select: { qty: true, unitPrice: true } } } })

  const findings: ConsistencyFinding[] = []
  for (const inv of invoices) {
    const expectedSubtotal = inv.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
    if (Math.abs(inv.subtotal - expectedSubtotal) > AMOUNT_TOLERANCE) {
      findings.push({
        id: `invoice-total-${inv.id}`,
        checkLabel: "Total Invoice tidak cocok",
        severity: "error",
        entityLabel: inv.invoiceNumber,
        description: `Subtotal tersimpan ${inv.subtotal.toLocaleString("id-ID")} ≠ jumlah baris item ${expectedSubtotal.toLocaleString("id-ID")}`,
        href: `/penjualan/${inv.id}`,
      })
    }
  }
  return findings
}

/** Pembayaran (InvoicePayment efektif) tidak boleh melebihi total Invoice. */
async function checkOverpayment(): Promise<ConsistencyFinding[]> {
  const invoices = await prisma.invoice.findMany({
    where: { postStatus: "posted" },
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
  })

  const findings: ConsistencyFinding[] = []
  for (const inv of invoices) {
    const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0)
    const cashDue = invoiceCashDue(inv, inv.client.isPemungutPpn)
    if (paid - cashDue > AMOUNT_TOLERANCE) {
      findings.push({
        id: `overpayment-${inv.id}`,
        checkLabel: "Pembayaran melebihi total Invoice",
        severity: "error",
        entityLabel: inv.invoiceNumber,
        description: `Sudah dibayar ${paid.toLocaleString("id-ID")}, tapi yang harus ditagih (kas) cuma ${cashDue.toLocaleString("id-ID")}`,
        href: `/penjualan/${inv.id}`,
      })
    }
  }
  return findings
}

/** Invoice lunas dengan cost-link (Domain/Server/Maintenance) tapi item terkait kelihatan belum
 *  ke-update lastPaidAt-nya — indikasi staf lupa pilih cost-link di form Pembayaran (gap yang
 *  didokumentasikan di Konsistensi-Data.md §3). Heuristik, jadi "warning" bukan "error". */
async function checkStaleCostLink(): Promise<ConsistencyFinding[]> {
  const paidInvoices = await prisma.invoice.findMany({
    where: { postStatus: "posted", status: "paid", costLinkType: { not: null }, costLinkId: { not: null } },
    select: { id: true, invoiceNumber: true, issuedAt: true, costLinkType: true, costLinkId: true },
  })
  if (paidInvoices.length === 0) return []

  const idsByType: Record<string, string[]> = { domain: [], server: [], maintenance: [] }
  for (const inv of paidInvoices) {
    if (inv.costLinkType && inv.costLinkId) idsByType[inv.costLinkType]?.push(inv.costLinkId)
  }

  const [domains, servers, maintenances] = await Promise.all([
    prisma.domain.findMany({ where: { id: { in: idsByType.domain } }, select: { id: true, lastPaidAt: true, name: true } }),
    prisma.server.findMany({ where: { id: { in: idsByType.server } }, select: { id: true, lastPaidAt: true, name: true } }),
    prisma.maintenance.findMany({ where: { id: { in: idsByType.maintenance } }, select: { id: true, lastPaidAt: true, name: true } }),
  ])
  const lastPaidByKey = new Map<string, { lastPaidAt: Date | null; name: string }>()
  for (const d of domains) lastPaidByKey.set(`domain:${d.id}`, d)
  for (const s of servers) lastPaidByKey.set(`server:${s.id}`, s)
  for (const m of maintenances) lastPaidByKey.set(`maintenance:${m.id}`, m)

  const findings: ConsistencyFinding[] = []
  for (const inv of paidInvoices) {
    const item = lastPaidByKey.get(`${inv.costLinkType}:${inv.costLinkId}`)
    if (!item) continue // item sudah dihapus — di luar cakupan check ini
    const stale = !item.lastPaidAt || item.lastPaidAt.getTime() < inv.issuedAt.getTime()
    if (stale) {
      findings.push({
        id: `stale-costlink-${inv.id}`,
        checkLabel: "Cost-link kemungkinan belum ke-sync",
        severity: "warning",
        entityLabel: inv.invoiceNumber,
        description: `Invoice sudah lunas & terkait ke ${inv.costLinkType} "${item.name}", tapi tanggal terakhir bayar item itu belum ter-update — kemungkinan cost-link belum dipilih saat Pelunasan`,
        href: `/penjualan/${inv.id}`,
      })
    }
  }
  return findings
}

/** BillingFollowUp (SLA tracker) — satu (refType, refId) cuma boleh punya 1 siklus aktif. */
async function checkDuplicateActiveSla(): Promise<ConsistencyFinding[]> {
  const active = await prisma.billingFollowUp.findMany({
    where: { paidRecordedAt: null },
    select: { id: true, refType: true, refId: true },
  })

  const groups = new Map<string, string[]>()
  for (const f of active) {
    const key = `${f.refType}:${f.refId}`
    groups.set(key, [...(groups.get(key) ?? []), f.id])
  }

  const findings: ConsistencyFinding[] = []
  for (const [key, ids] of groups) {
    if (ids.length > 1) {
      findings.push({
        id: `duplicate-sla-${key}`,
        checkLabel: "Siklus SLA dobel",
        severity: "error",
        entityLabel: key,
        description: `${ids.length} siklus BillingFollowUp aktif sekaligus untuk item yang sama (harusnya maks. 1)`,
        href: "/laporan/tindak-lanjut-tagihan",
      })
    }
  }
  return findings
}

/** Jalankan semua pengecekan konsistensi data (read-only, tidak mengubah apa pun) — lihat
 *  Konsistensi-Data.md untuk penjelasan tiap invariant. Dipakai oleh
 *  /pengaturan/cek-konsistensi-data. */
export async function runDataConsistencyChecks(): Promise<ConsistencyFinding[]> {
  const results = await Promise.all([
    checkJournalBalance(),
    checkInvoiceTotals(),
    checkOverpayment(),
    checkStaleCostLink(),
    checkDuplicateActiveSla(),
  ])
  return results.flat()
}
