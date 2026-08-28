import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { suggestReplies } from "@/lib/marketing/ai"
import { prisma } from "@/lib/prisma"

/** GET — 3 saran balasan terbaru untuk percakapan ini. POST — generate saran baru. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const { id } = await params

  const rows = await prisma.leadAiSuggestion.findMany({
    where: { conversationId: id },
    orderBy: { generatedAt: "desc" },
    take: 6,
    select: { id: true, style: true, text: true, usedAt: true, generatedAt: true },
  })
  const seen = new Set<string>()
  const latest = rows.filter((r) => (seen.has(r.style) ? false : (seen.add(r.style), true)))
  return NextResponse.json({ suggestions: latest })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const { id } = await params

  try {
    const created = await suggestReplies(id)
    return NextResponse.json({ suggestions: created })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat saran" }, { status: 422 })
  }
}
