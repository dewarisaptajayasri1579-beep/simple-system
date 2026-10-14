import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

type SaveItem = {
  nama?: string
  qty?: number
  scores?: Record<string, string>
  points?: number
  unitPrice?: number
  reason?: string | null
}

type SaveBody = {
  title?: string
  summary?: string | null
  clientName?: string | null
  transcript?: unknown
  /** "bobot" (Kalkulator Harga umum) | "level" (Pengajuan Pekerjaan Blesscom). */
  kind?: string
  items?: SaveItem[]
}

/** Simpan 1 hasil simulasi beserta rincian bobot tiap pekerjaannya. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as SaveBody | null
  const title = body?.title?.trim()
  const items = body?.items ?? []
  if (!title) return NextResponse.json({ error: "Judul simulasi wajib diisi" }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: "Belum ada pekerjaan yang bisa disimpan" }, { status: 400 })

  const normalized = items.map((it, i) => {
    const qty = Math.max(1, Math.round(it.qty ?? 1))
    const points = Number(it.points ?? 0)
    const unitPrice = Math.max(0, Math.round(it.unitPrice ?? 0))
    return {
      nama: it.nama?.trim() || `Pekerjaan ${i + 1}`,
      qty,
      scores: (it.scores ?? {}) as object,
      points,
      unitPrice,
      reason: it.reason?.trim() || null,
      sortOrder: i + 1,
    }
  })

  const totalPoints = normalized.reduce((sum, it) => sum + it.points * it.qty, 0)
  const totalPrice = normalized.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)

  const simulation = await prisma.workPriceSimulation.create({
    data: {
      title,
      summary: body?.summary?.trim() || null,
      clientName: body?.clientName?.trim() || null,
      kind: body?.kind === "level" ? "level" : "bobot",
      transcript: (body?.transcript ?? null) as object | undefined,
      totalPoints,
      totalPrice,
      createdById: user.id,
      items: { create: normalized },
    },
    select: { id: true },
  })

  return NextResponse.json(simulation, { status: 201 })
}
