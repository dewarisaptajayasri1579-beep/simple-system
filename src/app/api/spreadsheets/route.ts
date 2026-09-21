import { NextResponse } from "next/server"

import { extractSpreadsheetId } from "@/lib/google-sheets"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

function canView(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("spreadsheet")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canView(user)) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  const sheets = await prisma.linkedSpreadsheet.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json(sheets)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa nambah link spreadsheet" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const sourceUrl = typeof body?.sourceUrl === "string" ? body.sourceUrl.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 })
  if (!sourceUrl) return NextResponse.json({ error: "URL Google Sheets wajib diisi" }, { status: 400 })

  const spreadsheetId = extractSpreadsheetId(sourceUrl)
  if (!spreadsheetId) return NextResponse.json({ error: "URL Google Sheets tidak valid" }, { status: 400 })

  const sheet = await prisma.linkedSpreadsheet.create({
    data: {
      name,
      sourceUrl,
      spreadsheetId,
      category: typeof body?.category === "string" && body.category.trim() ? body.category.trim() : null,
      description: typeof body?.description === "string" && body.description.trim() ? body.description.trim() : null,
      createdById: user.id,
    },
  })
  return NextResponse.json(sheet, { status: 201 })
}
