import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { reconcileInvoiceJournals } from "@/lib/accounting/reconcile"

/** Rekalkulasi jurnal akrual semua invoice — perbaiki invoice lama yang dijurnal dengan aturan
 *  sebelum Piutang/Pendapatan diakui saat invoice terbit (lihat reconcile.ts). Owner-only karena
 *  ini bisa void+buat ulang jurnal yang sudah posted. Aman dijalankan berkali-kali (idempotent) —
 *  invoice yang jurnalnya sudah benar dilewati begitu saja. */
export async function POST() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menjalankan rekalkulasi" }, { status: 403 })

  const invoices = await prisma.invoice.findMany({
    where: { postStatus: { not: "voided" } },
    select: { id: true, invoiceNumber: true },
  })

  let invoicesFixed = 0
  let paymentsFixed = 0
  const errors: { invoiceNumber: string; error: string }[] = []

  for (const inv of invoices) {
    try {
      const summary = await prisma.$transaction((tx) => reconcileInvoiceJournals(tx, inv.id, user.id))
      if (summary.costFixed || summary.revenueCreated || summary.paymentsFixed > 0) invoicesFixed += 1
      paymentsFixed += summary.paymentsFixed
    } catch (err) {
      errors.push({ invoiceNumber: inv.invoiceNumber, error: err instanceof Error ? err.message : "Gagal" })
    }
  }

  return NextResponse.json({
    invoicesChecked: invoices.length,
    invoicesFixed,
    paymentsFixed,
    errors,
  })
}
