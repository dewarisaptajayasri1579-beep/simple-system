import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { matchWorkPriceItems } from "@/lib/work-price/ai-match"

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { deskripsi?: string } | null
  const description = body?.deskripsi?.trim()
  if (!description) return NextResponse.json({ error: "Deskripsi pekerjaan wajib diisi" }, { status: 400 })

  const catalog = await prisma.workPriceItem.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  })

  try {
    const result = await matchWorkPriceItems(description, catalog)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menganalisa deskripsi pekerjaan"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
