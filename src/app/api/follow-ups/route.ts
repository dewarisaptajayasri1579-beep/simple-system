import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const followUps = await prisma.followUp.findMany({ orderBy: { followUpDate: "desc" } })
  return NextResponse.json(followUps)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const note = typeof body?.note === "string" ? body.note.trim() : ""
  const followUpDate = typeof body?.followUpDate === "string" && body.followUpDate ? new Date(body.followUpDate) : new Date()

  if (!subject) return NextResponse.json({ error: "Subjek wajib diisi" }, { status: 400 })
  if (!note) return NextResponse.json({ error: "Catatan wajib diisi" }, { status: 400 })

  const followUp = await prisma.followUp.create({ data: { subject, note, followUpDate } })
  return NextResponse.json(followUp, { status: 201 })
}
