import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { analyzeLead } from "@/lib/marketing/ai"
import { prisma } from "@/lib/prisma"

/** GET — analisa AI terbaru per tipe (SEGMENTATION/PROFILING/SUMMARY/NEXT_BEST_ACTION/BUYING_SIGNAL).
 *  POST — jalankan analisa baru (async di request ini; gagal AI TIDAK bikin 5xx fatal ke UI). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const { id } = await params

  const rows = await prisma.leadAiAnalysis.findMany({
    where: { leadId: id, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { analysisType: true, outputJson: true, confidence: true, createdAt: true },
  })
  const latest: Record<string, unknown> = {}
  for (const r of rows) {
    if (!latest[r.analysisType]) {
      latest[r.analysisType] = { output: r.outputJson, confidence: r.confidence, at: r.createdAt.toISOString() }
    }
  }
  return NextResponse.json({ analyses: latest })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const { id } = await params

  try {
    await analyzeLead(id)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analisa AI gagal" }, { status: 422 })
  }
  return NextResponse.json({ ok: true })
}
