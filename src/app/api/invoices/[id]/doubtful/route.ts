import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { invoiceCashDue } from "@/lib/invoice-due"

/** Tandai invoice sebagai **Piutang Ragu-Ragu** (POST) atau batalkan penandaan itu (DELETE) —
 *  Owner-only, alasan WAJIB diisi saat menandai.
 *
 *  Efeknya murni pengurang Piutang Outstanding: invoice-nya tetap posted & tetap kelihatan di
 *  riwayat/Laporan Penjualan, cuma dikeluarkan dari semua perhitungan piutang (Dashboard,
 *  halaman Piutang, Neraca, Arus Kas) dan berhenti ditagih otomatis (cron follow-up piutang,
 *  SLA tindak lanjut, AI Agent). TIDAK ada jurnal — Piutang memang bukan akun GL di app ini
 *  (lihat pedoman_akunting.md & catatan di model Invoice).
 *
 *  Beda dari POST /api/invoices/[id]/void: void = invoice-nya salah input (dianggap tidak
 *  pernah ada). Ragu-ragu = invoice-nya benar, cuma uangnya dianggap tidak akan cair. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") {
    return NextResponse.json({ error: "Cuma Owner yang bisa menandai Piutang Ragu-Ragu" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  // Alasan sengaja WAJIB (beda dari VoidButton yang alasannya opsional) — ini menghapus angka
  // dari Piutang Outstanding, jadi harus selalu ada keterangan kenapa di riwayatnya.
  if (!reason) return NextResponse.json({ error: "Alasan wajib diisi" }, { status: 400 })

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, isPemungutPpn: true } },
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
  })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (invoice.postStatus !== "posted") {
    return NextResponse.json({ error: "Cuma invoice yang sudah posted yang bisa ditandai ragu-ragu" }, { status: 400 })
  }
  if (invoice.doubtfulAt) {
    return NextResponse.json({ error: "Invoice ini sudah ditandai ragu-ragu" }, { status: 400 })
  }

  // Sisa tagihan pakai basis yang sama dengan halaman Piutang (invoiceCashDue — DPP saja untuk
  // client Pemungut PPN). Kalau sudah lunas tidak ada piutang yang perlu diragukan.
  const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = invoiceCashDue(invoice, invoice.client.isPemungutPpn) - paid
  if (remaining <= 0) {
    return NextResponse.json({ error: "Invoice ini sudah lunas — tidak ada piutang yang bisa ditandai ragu-ragu" }, { status: 400 })
  }

  const doubtfulAt = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.invoice.update({
      where: { id },
      // pendingAt ikut dibersihkan: ragu-ragu itu eskalasi dari pending ("ditunda" jadi "tidak
      // akan cair"), satu invoice tidak boleh menyandang dua status sekaligus (lihat catatan di
      // model Invoice & POST /api/invoices/[id]/pending).
      data: { doubtfulAt, doubtfulReason: reason, doubtfulById: user.id, pendingAt: null, pendingReason: null, pendingById: null },
      include: { client: true },
    })

    // Berhenti mengejar tagihan ini: siklus SLA tindak-lanjut yang masih terbuka ditutup, supaya
    // invoice ragu-ragu tidak nyangkut selamanya di "Tindak Lanjut Tagihan" & badge SLA Lewat.
    await tx.billingFollowUp.updateMany({
      where: { invoiceId: id, paidRecordedAt: null, writeOffAt: null },
      data: { writeOffAt: doubtfulAt },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "invoice_mark_doubtful",
        entityType: "invoice",
        entityId: id,
        metadataJson: {
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.client.name,
          remaining,
          reason,
          // Kalau sebelumnya pending, catat alasan lamanya biar riwayat eskalasinya utuh.
          previousPendingReason: invoice.pendingReason,
        },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}

/** Batalkan penandaan ragu-ragu — mis. ternyata client-nya bayar juga. Invoice kembali masuk
 *  Piutang Outstanding apa adanya, dan siklus tindak-lanjut yang tadi ditutup dibuka lagi
 *  (writeOffAt cuma pernah diisi oleh fitur ini, jadi aman dihapus semua untuk invoice ini). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") {
    return NextResponse.json({ error: "Cuma Owner yang bisa membatalkan penandaan Piutang Ragu-Ragu" }, { status: 403 })
  }

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (!invoice.doubtfulAt) return NextResponse.json({ error: "Invoice ini tidak ditandai ragu-ragu" }, { status: 400 })

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.invoice.update({
      where: { id },
      data: { doubtfulAt: null, doubtfulReason: null, doubtfulById: null },
      include: { client: true },
    })

    await tx.billingFollowUp.updateMany({
      where: { invoiceId: id, writeOffAt: { not: null } },
      data: { writeOffAt: null },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "invoice_unmark_doubtful",
        entityType: "invoice",
        entityId: id,
        metadataJson: {
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.client.name,
          previousReason: invoice.doubtfulReason,
        },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}
