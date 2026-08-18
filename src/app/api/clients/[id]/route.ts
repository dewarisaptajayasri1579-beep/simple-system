import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, string | null | boolean> = {}
  for (const key of ["name", "email", "phoneNumber", "picName", "picPhone", "city", "address", "notes"]) {
    if (typeof body[key] === "string") data[key] = body[key] || null
  }
  if (typeof body.isPemungutPpn === "boolean") data.isPemungutPpn = body.isPemungutPpn
  if (typeof body.name === "string" && !body.name.trim()) {
    return NextResponse.json({ error: "Nama client wajib diisi" }, { status: 400 })
  }

  try {
    const client = await prisma.client.update({ where: { id }, data })
    return NextResponse.json(client)
  } catch (err) {
    console.error("PATCH /api/clients/[id] gagal:", err)
    return NextResponse.json({ error: "Gagal menyimpan client" }, { status: 500 })
  }
}
