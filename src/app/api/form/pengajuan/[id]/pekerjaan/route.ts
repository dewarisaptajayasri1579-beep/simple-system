import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { continueWorkPriceChat, type WorkPriceChatTurn } from "@/lib/work-price/ai-match"
import { hasFormAccess } from "@/lib/work-price/form-gate"

/**
 * Obrolan AI untuk SATU pekerjaan di dalam form pengajuan.
 *
 * Bedanya dengan /api/kalkulator-harga/analisa: mode "form" dipakai supaya model tidak menyebut
 * harga/level, dan response yang dikembalikan ke browser SENGAJA dibersihkan dari poin & harga —
 * programmer tidak boleh tahu angkanya. Nilai bobot & harganya tetap dihitung dan disimpan ke
 * database untuk dibaca admin nanti.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasFormAccess())) return NextResponse.json({ error: "Sesi form habis — masukkan password lagi" }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { history?: WorkPriceChatTurn[]; maxQuestions?: number; forceConclude?: boolean }
    | null
  const history = body?.history
  if (!history || history.length === 0) return NextResponse.json({ error: "Deskripsi pekerjaan wajib diisi" }, { status: 400 })

  const req = await prisma.workRequest.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!req) return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 })
  if (req.status === "posted") return NextResponse.json({ error: "Pengajuan sudah dikirim dan tidak bisa diubah lagi" }, { status: 409 })

  const catalog = await prisma.workPriceItem.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, groupName: true, level: true, label: true, description: true, price: true, weightPoints: true, weightDetail: true },
  })

  const questionsAsked = history.filter((h) => h.role === "assistant").length

  try {
    const result = await continueWorkPriceChat(history, catalog, questionsAsked, {
      mode: "form",
      maxQuestions: Math.min(15, Math.max(1, Math.round(body?.maxQuestions ?? 5))),
      forceConclude: body?.forceConclude === true,
    })

    if (result.status === "tanya") {
      return NextResponse.json({ status: "tanya", pertanyaan: result.pertanyaan, tipeJawaban: result.tipeJawaban, pilihan: result.pilihan })
    }

    // Simpan tiap pekerjaan hasil penilaian beserta poin & harganya (tidak dikirim balik).
    const last = await prisma.workRequestItem.findFirst({
      where: { requestId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    })
    let nextSort = (last?.sortOrder ?? 0) + 1

    const created = []
    for (const job of result.pekerjaan) {
      const row = await prisma.workRequestItem.create({
        data: {
          requestId: id,
          nama: job.nama,
          qty: job.qty,
          summary: result.ringkasan,
          transcript: history as object,
          scores: job.scores as object,
          points: job.poin,
          unitPrice: job.hargaSatuan,
          reason: job.alasan,
          sortOrder: nextSort++,
        },
        select: { id: true, nama: true, qty: true, summary: true },
      })
      created.push(row)
    }

    return NextResponse.json({ status: "selesai", ringkasan: result.ringkasan, items: created })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memproses pekerjaan"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
