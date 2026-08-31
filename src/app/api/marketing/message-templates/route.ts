import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET  — daftar template pesan, dibagi ke satu tim modul Marketing (bukan per-Sales).
 * POST — tambah template baru. Siapa aja yang punya akses modul Marketing boleh bikin.
 */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const templates = await prisma.messageTemplate.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, body: true, createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ templates })
}

export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { title?: unknown; body?: unknown } | null
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const text = typeof body?.body === "string" ? body.body.trim() : ""
  if (!title || !text) return NextResponse.json({ error: "Judul dan isi template wajib diisi" }, { status: 400 })

  const template = await prisma.messageTemplate.create({
    data: { title, body: text, createdById: user.id },
    select: { id: true, title: true, body: true, createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ template }, { status: 201 })
}
