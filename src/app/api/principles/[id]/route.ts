import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/**
 * PATCH — ubah data principle, termasuk aktif/non-aktif.
 *
 * Non-aktif WAJIB bawa tanggal (`deactivatedAt`, dari modal "Non Aktif di tgl berapa") karena
 * tanggal itulah yang menentukan mulai bulan mana dia berhenti ditagih — lihat
 * isPrincipleBillableForMonth. Diaktifkan kembali → tanggalnya dikosongkan.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "admin", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa mengubah principle" }, { status: 403 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { name?: string; appUrl?: string | null; startedAt?: string | null; active?: boolean; deactivatedAt?: string | null; notes?: string | null }
    | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  let activeData: { active: boolean; deactivatedAt: Date | null } | null = null
  if (body.active === false) {
    if (!body.deactivatedAt) return NextResponse.json({ error: "Tanggal non-aktif wajib diisi" }, { status: 400 })
    activeData = { active: false, deactivatedAt: new Date(`${body.deactivatedAt}T00:00:00+07:00`) }
  } else if (body.active === true) {
    activeData = { active: true, deactivatedAt: null }
  }

  const principle = await prisma.principle.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.appUrl !== undefined ? { appUrl: body.appUrl?.trim() || null } : {}),
      ...(body.startedAt !== undefined
        ? { startedAt: body.startedAt ? new Date(`${body.startedAt}T00:00:00+07:00`) : null }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      ...(activeData ?? {}),
    },
  })
  return NextResponse.json(principle)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa menghapus principle" }, { status: 403 })
  }

  const { id } = await params
  // Lampiran invoice lama memegang principleId-nya; di-null-kan dulu supaya invoice yang sudah
  // terkirim tetap bisa dicetak (nama & link sudah disnapshot sebagai teks di lampiran).
  await prisma.principleInvoiceItem.updateMany({ where: { principleId: id }, data: { principleId: null } })
  await prisma.principle.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
