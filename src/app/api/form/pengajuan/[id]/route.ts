import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { hasFormAccess } from "@/lib/work-price/form-gate"

/** Bentuk data yang boleh dilihat programmer — poin/harga SENGAJA tidak ikut. */
function toFormShape(req: {
  id: string
  clientName: string
  programmerName: string
  status: string
  items: { id: string; nama: string; qty: number; summary: string | null; transcript: unknown; sortOrder: number }[]
}) {
  return {
    id: req.id,
    clientName: req.clientName,
    programmerName: req.programmerName,
    status: req.status,
    items: req.items.map((it) => ({
      id: it.id,
      nama: it.nama,
      qty: it.qty,
      summary: it.summary,
      transcript: it.transcript ?? [],
    })),
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasFormAccess())) return NextResponse.json({ error: "Sesi form habis — masukkan password lagi" }, { status: 401 })

  const { id } = await params
  const req = await prisma.workRequest.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  })
  if (!req) return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 })

  return NextResponse.json(toFormShape(req))
}

/** Auto-save nama client/programmer, atau posting pengajuan ke admin. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasFormAccess())) return NextResponse.json({ error: "Sesi form habis — masukkan password lagi" }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as { clientName?: string; programmerName?: string; post?: boolean } | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const existing = await prisma.workRequest.findUnique({
    where: { id },
    include: { items: { select: { points: true, unitPrice: true, qty: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 })
  if (existing.status === "posted") {
    return NextResponse.json({ error: "Pengajuan sudah dikirim dan tidak bisa diubah lagi" }, { status: 409 })
  }

  if (body.post) {
    const clientName = (body.clientName ?? existing.clientName).trim()
    const programmerName = (body.programmerName ?? existing.programmerName).trim()
    if (!clientName) return NextResponse.json({ error: "Nama client wajib diisi" }, { status: 400 })
    if (!programmerName) return NextResponse.json({ error: "Nama programmer wajib diisi" }, { status: 400 })
    if (existing.items.length === 0) return NextResponse.json({ error: "Belum ada pekerjaan yang ditambahkan" }, { status: 400 })

    // Total dihitung ulang dari item saat posting, bukan dari angka yang dikirim form — form
    // memang tidak pernah memegang poin/harga.
    const totalPoints = existing.items.reduce((sum, it) => sum + it.points * it.qty, 0)
    const totalPrice = existing.items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)

    await prisma.workRequest.update({
      where: { id },
      data: { clientName, programmerName, status: "posted", postedAt: new Date(), totalPoints, totalPrice },
    })
    return NextResponse.json({ ok: true, status: "posted" })
  }

  await prisma.workRequest.update({
    where: { id },
    data: {
      ...(body.clientName !== undefined ? { clientName: body.clientName.trim() } : {}),
      ...(body.programmerName !== undefined ? { programmerName: body.programmerName.trim() } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}
