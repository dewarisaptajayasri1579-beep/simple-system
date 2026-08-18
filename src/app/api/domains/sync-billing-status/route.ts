import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeDomainExpiryDate } from "@/lib/domain-status"

/** "Sinkronisasi" (tombol di Dashboard > Domain) — reconcile status Domain terhadap Invoice/
 *  Payment yang senyatanya sudah ada, buat 2 celah yang bisa bikin Domain nyangkut kelihatan
 *  "belum ditagih"/"belum dibayar" padahal sudah:
 *
 *  1. Sudah ditagih tapi BillingFollowUp siklus aktifnya invoicedAt masih kosong — kejadian
 *     kalau siklus lama sempat ke-close (paidRecordedAt keisi pas Payment diinput, lihat
 *     /api/payments) sebelum invoice barunya sempat ke-link (lihat billing-follow-up.ts).
 *  2. Invoice-nya sudah lunas (Payment posted, Invoice.status "paid") tapi Domain.lastPaidAt/
 *     expiryDate belum maju — kejadian kalau staf lupa isi baris Biaya (HPP) "Bayar Domain"
 *     pas input Payment, jadi finalizeTransactionPosting tidak pernah nyentuh Domain ini.
 *
 *  Cuma benerin field pelacakan (Domain.lastPaidAt/expiryDate, BillingFollowUp), TIDAK bikin
 *  Transaction/jurnal baru — itu tetap harus lewat "Bayar Domain" beneran kalau memang belum
 *  pernah dijurnal, sinkronisasi ini bukan pengganti proses itu. */
export async function POST() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const domains = await prisma.domain.findMany({ where: { active: true, clientId: { not: null } } })

  let taggedCount = 0
  let paidCount = 0
  const fixed: { name: string; action: string }[] = []

  for (const domain of domains) {
    const latestInvoice = await prisma.invoice.findFirst({
      where: { costLinkType: "domain", costLinkId: domain.id, postStatus: "posted" },
      orderBy: { issuedAt: "desc" },
    })
    if (!latestInvoice) continue

    const activeCycle = await prisma.billingFollowUp.findFirst({
      where: { refType: "domain", refId: domain.id, paidRecordedAt: null },
      orderBy: { createdAt: "desc" },
    })

    if (latestInvoice.status === "paid") {
      const latestPayment = await prisma.invoicePayment.findFirst({
        where: { invoiceId: latestInvoice.id, OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] },
        orderBy: { paidAt: "desc" },
      })
      const paidAt = latestPayment?.paidAt ?? latestInvoice.issuedAt

      const alreadySynced = domain.lastPaidAt && domain.lastPaidAt.getTime() >= paidAt.getTime()
      if (!alreadySynced) {
        const previousAnchor = domain.expiryDate ?? domain.lastPaidAt ?? null
        const nextExpiry = computeDomainExpiryDate(previousAnchor) ?? paidAt
        await prisma.domain.update({ where: { id: domain.id }, data: { lastPaidAt: paidAt, expiryDate: nextExpiry } })
        paidCount++
        fixed.push({ name: domain.name, action: `sudah dibayar — expiry dimajukan ke ${nextExpiry.toLocaleDateString("id-ID")}` })
      }

      if (activeCycle) {
        await prisma.billingFollowUp.update({
          where: { id: activeCycle.id },
          data: {
            invoicedAt: activeCycle.invoicedAt ?? latestInvoice.issuedAt,
            invoiceId: activeCycle.invoiceId ?? latestInvoice.id,
            paidRecordedAt: paidAt,
            paidRecordedById: user.id,
          },
        })
      }
    } else if (activeCycle && !activeCycle.invoicedAt) {
      await prisma.billingFollowUp.update({
        where: { id: activeCycle.id },
        data: { invoicedAt: latestInvoice.issuedAt, invoiceId: latestInvoice.id },
      })
      taggedCount++
      fixed.push({ name: domain.name, action: `label dibetulkan — sudah ditagih (${latestInvoice.invoiceNumber})` })
    }
  }

  // Domain yang expiry-nya barusan dimajukan otomatis hilang dari daftar "due" begitu Dashboard
  // di-refresh (getExpiryBucket dihitung ulang di server component-nya) — tidak perlu langkah
  // tambahan di sini.
  return NextResponse.json({ checked: domains.length, taggedCount, paidCount, fixed })
}
