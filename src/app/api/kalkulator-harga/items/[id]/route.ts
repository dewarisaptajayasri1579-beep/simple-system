import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** PATCH — ubah harga/keterangan 1 item acuan level. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "admin", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa mengubah acuan level" }, { status: 403 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => null)) as { price?: number; description?: string | null } | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const item = await prisma.workPriceItem.update({
    where: { id },
    data: {
      ...(body.price !== undefined ? { price: Math.max(0, Math.round(body.price)) } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
    },
  })
  return NextResponse.json(item)
}
