import { NextResponse } from "next/server"

import { BLESSCOM_WORK_ROLES } from "@/lib/blesscom-work-order"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/**
 * Tandai beberapa transaksi pekerjaan sebagai sudah ditagihkan di sebuah invoice.
 *
 * Dipanggil SETELAH POST /api/invoices — pola dua panggilan yang sama dengan Invoice Over
 * Principle (lihat BuatInvoicePrincipleButton): pembuatan invoice tetap lewat jalur invoice
 * normal (nomor invoice, BillingFollowUp, aturan posting), endpoint ini cuma menyambungkan.
 *
 * Satu invoice = satu principle, jadi semua transaksi yang ditandai wajib principle yang sama.
 */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!BLESSCOM_WORK_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa menagihkan pekerjaan" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { invoiceId?: string; workOrderIds?: unknown } | null
  const invoiceId = body?.invoiceId
  const ids = Array.isArray(body?.workOrderIds) ? (body.workOrderIds as unknown[]).filter((v): v is string => typeof v === "string") : []

  if (!invoiceId) return NextResponse.json({ error: "invoiceId wajib" }, { status: 400 })
  if (ids.length === 0) return NextResponse.json({ error: "Minimal 1 transaksi" }, { status: 400 })

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })

  const orders = await prisma.blesscomWorkOrder.findMany({
    where: { id: { in: ids } },
    select: { id: true, principleId: true, invoiceId: true },
  })
  if (orders.length !== ids.length) return NextResponse.json({ error: "Ada transaksi yang tidak ditemukan" }, { status: 404 })

  const sudah = orders.find((o) => o.invoiceId)
  if (sudah) return NextResponse.json({ error: "Ada transaksi yang sudah ditagihkan di invoice lain" }, { status: 409 })

  if (new Set(orders.map((o) => o.principleId)).size > 1) {
    return NextResponse.json({ error: "Satu invoice hanya boleh untuk satu principle" }, { status: 400 })
  }

  // Klaim atomic (`invoiceId: null`) — jaga-jaga dua orang menagihkan transaksi yang sama bareng.
  const claimed = await prisma.blesscomWorkOrder.updateMany({
    where: { id: { in: ids }, invoiceId: null },
    data: { invoiceId, invoicedAt: new Date() },
  })
  if (claimed.count !== ids.length) {
    return NextResponse.json({ error: "Ada transaksi yang baru saja ditagihkan orang lain" }, { status: 409 })
  }

  return NextResponse.json({ ok: true, count: claimed.count })
}
