import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const items = await prisma.systemDevelopmentItem.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json(items)
}

/** Tambah usulan/rencana pengembangan sistem — sengaja dibuka ke semua role (bukan cuma
 *  Owner) supaya siapa pun bisa usul fitur baru langsung dari menu ini, mirip pola kategori
 *  biaya yang bisa ditambah dari form Kas Keluar. Hapus tetap Owner-only (lihat DELETE
 *  di [id]/route.ts). */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  if (!title) return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 })

  const item = await prisma.systemDevelopmentItem.create({
    data: { title, description: description || null, createdById: user.id, createdByName: user.name },
  })
  return NextResponse.json(item, { status: 201 })
}
