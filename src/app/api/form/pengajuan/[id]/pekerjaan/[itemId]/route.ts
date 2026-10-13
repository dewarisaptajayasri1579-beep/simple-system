import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { hasFormAccess } from "@/lib/work-price/form-gate"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!(await hasFormAccess())) return NextResponse.json({ error: "Sesi form habis — masukkan password lagi" }, { status: 401 })

  const { id, itemId } = await params
  const req = await prisma.workRequest.findUnique({ where: { id }, select: { status: true } })
  if (!req) return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 })
  if (req.status === "posted") return NextResponse.json({ error: "Pengajuan sudah dikirim dan tidak bisa diubah lagi" }, { status: 409 })

  await prisma.workRequestItem.deleteMany({ where: { id: itemId, requestId: id } })
  return NextResponse.json({ ok: true })
}
