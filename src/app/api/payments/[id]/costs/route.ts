import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { markDomainPaid, markServerPaid, markMaintenancePaid } from "@/lib/accounting/mark-paid"

/** Tambah 1 baris Biaya baru (Bayar Domain/Server/Maintenance) ke Payment yang masih DRAFT —
 *  dipakai kalau staf lupa kaitkan biaya waktu bikin Pelunasan, atau memang mau bayar lebih
 *  dari 1 item sekaligus dari kas yang sama. Sama seperti markDomainPaid/dst yang dipakai di
 *  Kas Keluar & form Pelunasan — satu-satunya jalur pencatatan, jangan dobel logic. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menambah biaya ini" }, { status: 403 })

  const { id: paymentId } = await params
  const body = await request.json().catch(() => null)
  const kind = body?.kind === "server" ? "server" : body?.kind === "maintenance" ? "maintenance" : body?.kind === "domain" ? "domain" : ""
  const itemId = typeof body?.itemId === "string" ? body.itemId : ""
  const amount = Number(body?.amount)

  if (!kind) return NextResponse.json({ error: "Tipe biaya wajib dipilih" }, { status: 400 })
  if (!itemId) return NextResponse.json({ error: `Pilih ${kind === "domain" ? "domain" : kind === "server" ? "server" : "maintenance"}-nya dulu` }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: "Jumlah biaya wajib diisi" }, { status: 400 })

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") {
    return NextResponse.json({ error: "Pembayaran yang sudah diposting/dibatalkan tidak bisa diubah" }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (kind === "domain") {
        return markDomainPaid(tx, { domainId: itemId, accountId: payment.accountId, amount, paidAt: payment.paidAt, createdBy: user.id, paymentId })
      }
      if (kind === "server") {
        return markServerPaid(tx, { serverId: itemId, accountId: payment.accountId, amount, paidAt: payment.paidAt, createdBy: user.id, paymentId })
      }
      return markMaintenancePaid(tx, { maintenanceId: itemId, accountId: payment.accountId, amount, paidAt: payment.paidAt, createdBy: user.id, paymentId })
    })
    return NextResponse.json({ ok: true, transactionId: result.transaction.id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menambah biaya" }, { status: 400 })
  }
}
