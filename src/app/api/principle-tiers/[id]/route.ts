import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengubah tingkatan harga" }, { status: 403 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { label?: string; fromCount?: number; toCount?: number | null; unitPrice?: number }
    | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const tier = await prisma.principlePriceTier.update({
    where: { id },
    data: {
      ...(body.label !== undefined ? { label: body.label.trim() } : {}),
      ...(body.fromCount !== undefined ? { fromCount: Number(body.fromCount) } : {}),
      ...(body.toCount !== undefined ? { toCount: body.toCount == null || body.toCount === 0 ? null : Number(body.toCount) } : {}),
      ...(body.unitPrice !== undefined ? { unitPrice: Number(body.unitPrice) } : {}),
    },
  })
  return NextResponse.json(tier)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengubah tingkatan harga" }, { status: 403 })
  }
  const { id } = await params
  await prisma.principlePriceTier.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
