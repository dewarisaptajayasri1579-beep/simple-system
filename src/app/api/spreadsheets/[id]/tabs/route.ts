import { NextResponse } from "next/server"

import { listSheetTabs } from "@/lib/google-sheets"
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

  try {
    const tabs = await listSheetTabs(sheet.spreadsheetId)
    return NextResponse.json({ tabs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
