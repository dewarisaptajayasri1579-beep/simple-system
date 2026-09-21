import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Tandai renewal Domain sebagai **Pending** (POST) atau lepas penandaan itu (DELETE) —
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

  const domain = await prisma.domain.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!domain) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 })
  if (!domain.active) return NextResponse.json({ error: "Domain ini sudah nonaktif" }, { status: 400 })
  // Ragu-ragu itu tingkat lebih berat — turun lagi ke pending harus lewat "Aktifkan Lagi" dulu
  // supaya jelas di riwayat auditnya (sama pola dengan invoice, lihat ../doubtful).
  if (domain.doubtfulAt) {
    return NextResponse.json({ error: "Domain ini sedang ditandai Ragu-Ragu — aktifkan lagi dulu sebelum ditandai pending" }, { status: 400 })
  }
  if (domain.pendingAt) return NextResponse.json({ error: "Domain ini sudah ditandai pending" }, { status: 400 })

  const pendingAt = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.domain.update({ where: { id }, data: { pendingAt, pendingReason: reason, pendingById: user.id } })

    await tx.billingFollowUp.updateMany({
      where: { refType: "domain", refId: id, paidRecordedAt: null, writeOffAt: null },
      data: { writeOffAt: pendingAt },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "domain_mark_pending",
        entityType: "domain",
        entityId: id,
        metadataJson: { domainName: domain.name, clientName: domain.client?.name ?? null, sellPrice: domain.sellPrice, reason },
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
  const domain = await prisma.domain.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!domain) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 })
  if (!domain.pendingAt) return NextResponse.json({ error: "Domain ini tidak ditandai pending" }, { status: 400 })

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.domain.update({ where: { id }, data: { pendingAt: null, pendingReason: null, pendingById: null } })

    await tx.billingFollowUp.updateMany({ where: { refType: "domain", refId: id, writeOffAt: { not: null } }, data: { writeOffAt: null } })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "domain_unmark_pending",
        entityType: "domain",
        entityId: id,
        metadataJson: { domainName: domain.name, clientName: domain.client?.name ?? null, previousReason: domain.pendingReason },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}
