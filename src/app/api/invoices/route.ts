import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { generateInvoiceNumber } from "@/lib/invoice-number"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { invoiceCostLines, invoiceRevenueLines } from "@/lib/accounting/journal-rules"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const clientId = searchParams.get("clientId")
  const postStatus = searchParams.get("postStatus")

  // postStatus tidak difilter default — endpoint ini dipakai juga oleh menu manajemen Penjualan
  // yang perlu menampilkan draft. Consumer yang butuh "hanya invoice riil" (mis. picker piutang
  // di form Pembayaran) kirim eksplisit ?postStatus=posted.
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...(postStatus ? { postStatus } : {}),
    },
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
    orderBy: { issuedAt: "asc" },
  })

  return NextResponse.json(invoices)
}

interface LineInput {
  itemId?: string | null
  description: string
  qty: number
  unitPrice: number
  unitCost?: number
  discountAmount?: number
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const clientId = typeof body?.clientId === "string" ? body.clientId : ""
  const lines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []

  if (!clientId) return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 })
  if (lines.length === 0) return NextResponse.json({ error: "Minimal 1 baris item" }, { status: 400 })

  // Kalau invoice ini dibuat dari "Tagih Sekarang" (Dashboard Domain/Server/Maintenance) — simpan
  // link-nya supaya form Pembayaran nanti bisa otomatis pilih Bayar Domain/Server/Maintenance
  // tanpa staf pilih manual, dan supaya BillingFollowUp (SLA tindak-lanjut tagihan, lihat
  // sop.txt) bisa dikaitkan balik ke item asalnya.
  const domainId = typeof body?.domainId === "string" && body.domainId ? body.domainId : null
  const serverId = typeof body?.serverId === "string" && body.serverId ? body.serverId : null
  const maintenanceId = typeof body?.maintenanceId === "string" && body.maintenanceId ? body.maintenanceId : null
  const costLinkType = domainId ? "domain" : serverId ? "server" : maintenanceId ? "maintenance" : null
  const costLinkId = domainId ?? serverId ?? maintenanceId

  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })

  const ppnEnabled = Boolean(body?.ppnEnabled)
  const ppnRate = ppnEnabled ? Number(body?.ppnRate) || settings.defaultPpnRate : 0
  const invoiceDiscount = Number(body?.discountAmount) || 0

  const preparedLines = lines.map((line) => {
    const qty = Number(line.qty) || 1
    const unitPrice = Number(line.unitPrice) || 0
    const unitCost = Number(line.unitCost) || 0
    const discountAmount = Number(line.discountAmount) || 0
    const lineTotal = Math.max(0, qty * unitPrice - discountAmount)
    return {
      itemId: line.itemId || null,
      description: line.description || "(tanpa keterangan)",
      qty,
      unitPrice,
      unitCost,
      discountAmount,
      lineTotal,
    }
  })

  const subtotal = preparedLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  const totalLineDiscount = preparedLines.reduce((sum, l) => sum + l.discountAmount, 0)
  const totalCost = preparedLines.reduce((sum, l) => sum + l.qty * l.unitCost, 0)
  const discountAmount = totalLineDiscount + invoiceDiscount
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const ppnAmount = ppnEnabled ? Math.round(afterDiscount * (ppnRate / 100)) : 0
  const totalAmount = afterDiscount + ppnAmount

  try {
    const invoiceNumber = await generateInvoiceNumber()

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          clientId,
          issuedAt: body?.issuedAt ? new Date(body.issuedAt) : undefined,
          dueDate: body?.dueDate ? new Date(body.dueDate) : null,
          subtotal,
          discountAmount,
          ppnEnabled,
          ppnRate,
          ppnAmount,
          totalAmount,
          totalCost,
          notes: body?.notes || null,
          costLinkType,
          costLinkId,
          lines: { create: preparedLines },
        },
        include: { lines: true, client: true },
      })

      // Tahap 1 SLA tindak-lanjut tagihan (lihat sop.txt/billing-follow-up.ts) — invoice ini
      // dibuat dari "Tagih Sekarang", jadi tandai siklus BillingFollowUp aktif punya item itu
      // sebagai "sudah ditagih". updateMany dipakai (bukan update) supaya tidak error kalau
      // record-nya belum sempat dibuat (mis. invoice dibuat manual tanpa lewat Dashboard).
      if (costLinkType && costLinkId) {
        await tx.billingFollowUp.updateMany({
          where: { refType: costLinkType, refId: costLinkId, paidRecordedAt: null, invoicedAt: null },
          data: { invoicedAt: created.issuedAt, invoiceId: created.id },
        })
      }

      // Ledger akrual (JournalEntry/JournalLine): pendapatan, piutang, PPN, dan HPP semua diakui
      // sekarang (saat invoice terbit) — beda dari Transaction cash-basis yang baru mengakui
      // pendapatan saat pembayaran masuk (lihat /api/payments). Draft dulu, baru berlaku begitu
      // invoice ini diposting (lihat /api/invoices/[id]/post).
      if (totalCost > 0) {
        await postJournalEntry(tx, {
          date: created.issuedAt,
          description: `Invoice ${created.invoiceNumber} - ${created.client.name}`,
          sourceType: "invoice",
          sourceId: created.id,
          createdBy: user.id,
          lines: invoiceCostLines({ totalCost }),
        })
      }
      if (totalAmount > 0) {
        await postJournalEntry(tx, {
          date: created.issuedAt,
          description: `Invoice ${created.invoiceNumber} - ${created.client.name}`,
          sourceType: "invoice_revenue",
          sourceId: created.id,
          createdBy: user.id,
          lines: invoiceRevenueLines({ totalAmount, ppnAmount, revenueCoaCode: created.revenueCoaCode ?? undefined }),
        })
      }

      return created
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (err) {
    console.error("[POST /api/invoices]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat invoice" }, { status: 500 })
  }
}
