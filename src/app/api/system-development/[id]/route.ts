import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

const VALID_STATUS = ["belum", "proses", "selesai"]

/** Ubah status (Belum/Proses/Selesai), judul, atau deskripsi — dibuka ke semua role sama
 *  seperti tambah item, supaya siapa pun bisa update progress tanpa nunggu Owner. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const data: { title?: string; description?: string | null; status?: string } = {}

  if (body?.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 })
    data.title = title
  }
  if (body?.description !== undefined) {
    data.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null
  }
  if (body?.status !== undefined) {
    if (!VALID_STATUS.includes(body.status)) return NextResponse.json({ error: "Status tidak valid" }, { status: 400 })
    data.status = body.status
  }

  const item = await prisma.systemDevelopmentItem.update({ where: { id }, data })
  return NextResponse.json(item)
}

/** Hapus item — Owner-only, sama pola dengan hapus kategori/akun master data lain. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menghapus item ini" }, { status: 403 })

  const { id } = await params
  await prisma.systemDevelopmentItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
