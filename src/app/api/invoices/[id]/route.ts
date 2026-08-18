import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, lines: { include: { item: true } }, payments: { include: { account: true }, orderBy: { paidAt: "asc" } } },
  })

  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  return NextResponse.json(invoice)
}

interface LineInput {
  itemId?: string | null
  description: string
  qty: number
  unitPrice: number
  unitCost?: number
  discountAmount?: number
}

/** Edit invoice DRAFT — client, tanggal, catatan, baris item, diskon, PPN. Cuma boleh selagi
 *  masih draft (lihat guard di bawah) — invoice yang sudah posted tidak boleh diedit lewat
 *  sini karena Pendapatan/PPN/HPP-nya baru diakui SEKALIGUS saat Payment diposting (lihat
 *  komentar di POST /api/invoices), jadi tidak ada jurnal draft yang perlu disinkronkan
 *  ulang di sini — beda dengan Transaction. Baris item diganti seluruhnya (hapus lalu buat
 *  ulang) daripada di-diff satu-satu, sama sederhananya dengan create. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (invoice.postStatus !== "draft") {
    return NextResponse.json({ error: "Invoice yang sudah diposting/dibatalkan tidak bisa diedit" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const clientId = typeof body?.clientId === "string" ? body.clientId : ""
  const lines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []

  if (!clientId) return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 })
  if (lines.length === 0) return NextResponse.json({ error: "Minimal 1 baris item" }, { status: 400 })

  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })

  const ppnEnabled = Boolean(body?.ppnEnabled)
  const ppnRate = ppnEnabled ? Number(body?.ppnRate) || settings.defaultPpnRate : 0
  // "Exclude PPN" — lihat catatan sama di POST /api/invoices.
  const ppnInclusive = ppnEnabled && Boolean(body?.ppnInclusive)
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
  const ppnAmount = !ppnEnabled
    ? 0
    : ppnInclusive
      ? Math.round(afterDiscount * (ppnRate / (100 + ppnRate)))
      : Math.round(afterDiscount * (ppnRate / 100))
  const totalAmount = ppnInclusive ? afterDiscount : afterDiscount + ppnAmount

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } })
      return tx.invoice.update({
        where: { id },
        data: {
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
          lines: { create: preparedLines },
        },
        include: { client: true, lines: { include: { item: true } } },
      })
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[PATCH /api/invoices/[id]]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan perubahan" }, { status: 500 })
  }
}

/** Hapus invoice DRAFT (belum diposting) — dipakai untuk "edit": hapus draft, input ulang.
 *  Invoice yang sudah posted tidak boleh dihapus lewat sini. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (invoice.postStatus !== "draft") {
    return NextResponse.json({ error: "Invoice yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  }

  // Invoice tidak pernah bikin jurnal apa pun (lihat pedoman_akunting.md), jadi tidak ada
  // jurnal draft yang perlu ikut dibersihkan di sini — cukup hapus invoice-nya (InvoiceLine
  // ikut terhapus lewat onDelete: Cascade).
  await prisma.invoice.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
