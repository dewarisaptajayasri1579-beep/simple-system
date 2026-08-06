import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { generateInvoiceNumber } from "@/lib/invoice-number"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { invoiceCreatedLines } from "@/lib/accounting/journal-rules"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const clientId = searchParams.get("clientId")

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
    },
    include: { client: true, payments: true },
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

  const invoiceNumber = await generateInvoiceNumber()

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        dueDate: body?.dueDate ? new Date(body.dueDate) : null,
        subtotal,
        discountAmount,
        ppnEnabled,
        ppnRate,
        ppnAmount,
        totalAmount,
        totalCost,
        notes: body?.notes || null,
        lines: { create: preparedLines },
      },
      include: { lines: true, client: true },
    })

    await postJournalEntry(tx, {
      date: created.issuedAt,
      description: `Invoice ${created.invoiceNumber} - ${created.client.name}`,
      sourceType: "invoice",
      sourceId: created.id,
      createdBy: user.id,
      lines: invoiceCreatedLines({ totalAmount, afterDiscount, ppnAmount, totalCost }),
    })

    return created
  })

  return NextResponse.json(invoice, { status: 201 })
}
