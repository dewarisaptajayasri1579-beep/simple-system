import { NextResponse } from "next/server"

import { BLESSCOM_WORK_ROLES, parseWorkDate, parseWorkOrderItems } from "@/lib/blesscom-work-order"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/**
 * PATCH — ubah transaksi pekerjaan: master (tanggal/principle/catatan) + seluruh detailnya.
 *
 * Detail diganti utuh (hapus semua lalu buat ulang), bukan diff per baris: urutan & isinya memang
 * ditentukan form, dan tidak ada data lain yang menunjuk ke baris detail — invoice menyalin
 * keterangannya sebagai teks, bukan referensi.
 *
 * Transaksi yang SUDAH ditagihkan ditolak: nominalnya sudah ikut terkirim ke client lewat invoice,
 * jadi tidak boleh berubah diam-diam (hapus dulu invoice-nya kalau memang salah input).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!BLESSCOM_WORK_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa mengubah pekerjaan" }, { status: 403 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { principleId?: string; workDate?: string; notes?: string; items?: unknown }
    | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const existing = await prisma.blesscomWorkOrder.findUnique({
    where: { id },
    select: { id: true, invoiceId: true, invoice: { select: { invoiceNumber: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  if (existing.invoiceId) {
    return NextResponse.json(
      { error: `Sudah ditagihkan di invoice ${existing.invoice?.invoiceNumber ?? "-"} — tidak bisa diubah` },
      { status: 409 },
    )
  }

  const principleId = body.principleId
  if (!principleId) return NextResponse.json({ error: "Principle wajib dipilih" }, { status: 400 })

  const workDate = parseWorkDate(body.workDate)
  if (!workDate) return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 })

  const parsed = parseWorkOrderItems(body.items)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  await prisma.$transaction(async (tx) => {
    await tx.blesscomWorkOrderItem.deleteMany({ where: { workOrderId: id } })
    await tx.blesscomWorkOrder.update({
      where: { id },
      data: {
        principleId,
        workDate,
        notes: body.notes?.trim() || null,
        items: { create: parsed.items },
      },
    })
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!BLESSCOM_WORK_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa menghapus pekerjaan" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.blesscomWorkOrder.findUnique({
    where: { id },
    select: { invoiceId: true, invoice: { select: { invoiceNumber: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  if (existing.invoiceId) {
    return NextResponse.json(
      { error: `Sudah ditagihkan di invoice ${existing.invoice?.invoiceNumber ?? "-"} — tidak bisa dihapus` },
      { status: 409 },
    )
  }

  // Detail ikut terhapus lewat onDelete: Cascade.
  await prisma.blesscomWorkOrder.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
