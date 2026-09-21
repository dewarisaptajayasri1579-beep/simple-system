import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Tandai renewal Server sebagai **Pending** (POST) atau lepas penandaan itu (DELETE) —
 *  Owner-only, alasan WAJIB. Perlakuannya sama dengan ../doubtful (keluar dari "Tagihan Belum
 *  Ditagih" & berhenti dikejar SLA), bedanya cuma flag/makna — lihat catatan di ../doubtful. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menandai Pending" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (!reason) return NextResponse.json({ error: "Alasan wajib diisi" }, { status: 400 })

  const server = await prisma.server.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!server) return NextResponse.json({ error: "Server tidak ditemukan" }, { status: 404 })
  if (!server.active) return NextResponse.json({ error: "Server ini sudah nonaktif" }, { status: 400 })
  // Ragu-ragu itu tingkat lebih berat — turun lagi ke pending harus lewat "Aktifkan Lagi" dulu
  // supaya jelas di riwayat auditnya (sama pola dengan invoice, lihat ../doubtful).
  if (server.doubtfulAt) {
    return NextResponse.json({ error: "Server ini sedang ditandai Ragu-Ragu — aktifkan lagi dulu sebelum ditandai pending" }, { status: 400 })
  }
  if (server.pendingAt) return NextResponse.json({ error: "Server ini sudah ditandai pending" }, { status: 400 })

  const pendingAt = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.server.update({ where: { id }, data: { pendingAt, pendingReason: reason, pendingById: user.id } })

    await tx.billingFollowUp.updateMany({
      where: { refType: "server", refId: id, paidRecordedAt: null, writeOffAt: null },
      data: { writeOffAt: pendingAt },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "server_mark_pending",
        entityType: "server",
        entityId: id,
        metadataJson: { serverName: server.name, clientName: server.client?.name ?? null, price: server.price, reason },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa melepas status Pending" }, { status: 403 })

  const { id } = await params
  const server = await prisma.server.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!server) return NextResponse.json({ error: "Server tidak ditemukan" }, { status: 404 })
  if (!server.pendingAt) return NextResponse.json({ error: "Server ini tidak ditandai pending" }, { status: 400 })

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.server.update({ where: { id }, data: { pendingAt: null, pendingReason: null, pendingById: null } })

    await tx.billingFollowUp.updateMany({ where: { refType: "server", refId: id, writeOffAt: { not: null } }, data: { writeOffAt: null } })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "server_unmark_pending",
        entityType: "server",
        entityId: id,
        metadataJson: { serverName: server.name, clientName: server.client?.name ?? null, previousReason: server.pendingReason },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}
