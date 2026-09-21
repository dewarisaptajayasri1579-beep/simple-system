import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const letters = await prisma.correspondenceLog.findMany({ orderBy: { date: "desc" } })
  return NextResponse.json({ letters })
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const number = typeof body?.number === "string" ? body.number.trim() : ""
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const party = typeof body?.party === "string" ? body.party.trim() : ""
  const direction = body?.direction === "KELUAR" ? "KELUAR" : body?.direction === "MASUK" ? "MASUK" : null
  const dateStr = typeof body?.date === "string" ? body.date : ""

  if (!number || !subject || !party || !direction || !dateStr) {
    return NextResponse.json({ error: "Nomor, arah, perihal, tanggal, dan pihak terkait wajib diisi" }, { status: 400 })
  }

  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null

  const letter = await prisma.correspondenceLog.create({
    data: { number, direction, subject, party, date: new Date(dateStr), notes },
  })
  await logAudit({ actorUserId: user.id, action: "administratif.surat.create", entityType: "correspondence_log", entityId: letter.id, after: letter })

  return NextResponse.json({ letter }, { status: 201 })
}
