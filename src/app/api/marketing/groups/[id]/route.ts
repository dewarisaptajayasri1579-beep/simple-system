import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { canActOnGroup } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** PATCH /api/marketing/groups/[id] — rename grup (WA gak selalu kasih nama subject di webhook,
 *  jadi Sales isi manual sendiri, sama pola dengan rename label WhatsappConnection). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  if (!(await canActOnGroup(user, id))) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama grup wajib diisi" }, { status: 400 })

  const group = await prisma.groupChat.update({ where: { id }, data: { name } })
  return NextResponse.json({ group })
}
