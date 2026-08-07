import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  if (typeof body.name === "string" && !body.name.trim()) {
    return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 })
  }

  const data: Record<string, string | number | null> = {}
  for (const key of ["name", "phoneNumber", "address", "bankName", "bankAccount"]) {
    if (typeof body[key] === "string") data[key] = body[key] || null
  }
  if ("paymentTermDays" in body) data.paymentTermDays = body.paymentTermDays === null ? null : Number(body.paymentTermDays)
  if ("creditLimit" in body) data.creditLimit = body.creditLimit === null ? null : Number(body.creditLimit)

  const row = await prisma.legacySalesClient.update({
    where: { id },
    data,
    include: { client: { select: { id: true, name: true, picName: true, picPhone: true } } },
  })
  return NextResponse.json(row)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const staged = await prisma.legacySalesClient.findUnique({ where: { id }, include: { client: true } })
  if (!staged) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 })
  if (staged.client) {
    return NextResponse.json({ error: "Sudah terhubung ke Client, tidak bisa dihapus" }, { status: 400 })
  }

  await prisma.legacySalesClient.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
