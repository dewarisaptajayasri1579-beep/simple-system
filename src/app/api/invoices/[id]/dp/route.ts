import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Isi/ubah DP yang DISEPAKATI (belum tentu sudah dibayar) — CATATAN saja (lihat
 *  Invoice.dpAmount), tidak ada efek kas/jurnal, jadi boleh diedit kapan saja
 *  (draft/posted/voided), sama pola dengan PATCH /api/invoices/[id]/bukti-pungut. Pelunasan
 *  ASLI tetap wajib lewat menu Pembayaran (InvoicePayment), bukan lewat sini. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const dpAmount = Math.max(0, Number(body?.dpAmount) || 0)

  const updated = await prisma.invoice.update({ where: { id }, data: { dpAmount } })
  return NextResponse.json(updated)
}
