import { NextResponse } from "next/server"

import { extractSpreadsheetId } from "@/lib/google-sheets"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

function canView(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("spreadsheet")
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canView(user)) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  const { id } = await params
  const sheet = await prisma.linkedSpreadsheet.findUnique({ where: { id } })
  if (!sheet) return NextResponse.json({ error: "Spreadsheet tidak ditemukan" }, { status: 404 })
  return NextResponse.json(sheet)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa ubah link spreadsheet" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const data: { name?: string; sourceUrl?: string; spreadsheetId?: string; category?: string | null; description?: string | null } = {}

  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.sourceUrl === "string" && body.sourceUrl.trim()) {
    const spreadsheetId = extractSpreadsheetId(body.sourceUrl.trim())
    if (!spreadsheetId) return NextResponse.json({ error: "URL Google Sheets tidak valid" }, { status: 400 })
    data.sourceUrl = body.sourceUrl.trim()
    data.spreadsheetId = spreadsheetId
  }
  if (typeof body?.category === "string") data.category = body.category.trim() || null
  if (typeof body?.description === "string") data.description = body.description.trim() || null

  const sheet = await prisma.linkedSpreadsheet.update({ where: { id }, data })
  return NextResponse.json(sheet)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa hapus link spreadsheet" }, { status: 403 })

  const { id } = await params
  await prisma.linkedSpreadsheet.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
