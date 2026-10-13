import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { continueWorkPriceChat, type WorkPriceChatTurn } from "@/lib/work-price/ai-match"

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { history?: WorkPriceChatTurn[] } | null
  const history = body?.history
  if (!history || history.length === 0) return NextResponse.json({ error: "Deskripsi pekerjaan wajib diisi" }, { status: 400 })

  const catalog = await prisma.workPriceItem.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  })

  const questionsAsked = history.filter((h) => h.role === "assistant").length

  try {
    const result = await continueWorkPriceChat(history, catalog, questionsAsked)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menganalisa deskripsi pekerjaan"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
