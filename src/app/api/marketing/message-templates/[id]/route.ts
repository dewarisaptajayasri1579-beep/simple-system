import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/** PATCH/DELETE template pesan — dibagi ke satu tim, jadi siapa aja yang punya akses modul
 *  Marketing boleh edit/hapus template siapa aja (bukan cuma pembuatnya). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const existing = await prisma.messageTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 })

  const body = (await request.json().catch(() => null)) as { title?: unknown; body?: unknown } | null
  const data: { title?: string; body?: string } = {}
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim()
  if (typeof body?.body === "string" && body.body.trim()) data.body = body.body.trim()
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })

  const template = await prisma.messageTemplate.update({
    where: { id },
    data,
    select: { id: true, title: true, body: true, createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ template })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const existing = await prisma.messageTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 })

  await prisma.messageTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
