import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Tandai renewal Domain sebagai **Ragu-Ragu** (POST) atau batalkan penandaan itu (DELETE) —
 *  Owner-only, alasan WAJIB. Sama konsep dengan /api/invoices/[id]/doubtful (lihat catatan
 *  lengkap di situ & di model Invoice/Domain schema.prisma): dikeluarkan dari "Tagihan Belum
 *  Ditagih" & section Domain di Dashboard, berhenti dikejar SLA tindak-lanjut otomatis. Domain
 *  belum jadi invoice di titik ini, jadi tidak ada jurnal/piutang riil yang perlu dibalik. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menandai Ragu-Ragu" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (!reason) return NextResponse.json({ error: "Alasan wajib diisi" }, { status: 400 })

  const domain = await prisma.domain.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!domain) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 })
  if (!domain.active) return NextResponse.json({ error: "Domain ini sudah nonaktif" }, { status: 400 })
  if (domain.doubtfulAt) return NextResponse.json({ error: "Domain ini sudah ditandai ragu-ragu" }, { status: 400 })

  const doubtfulAt = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.domain.update({
      where: { id },
      data: { doubtfulAt, doubtfulReason: reason, doubtfulById: user.id, pendingAt: null, pendingReason: null, pendingById: null },
    })

    await tx.billingFollowUp.updateMany({
      where: { refType: "domain", refId: id, paidRecordedAt: null, writeOffAt: null },
      data: { writeOffAt: doubtfulAt },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "domain_mark_doubtful",
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
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa membatalkan penandaan ini" }, { status: 403 })

  const { id } = await params
  const domain = await prisma.domain.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!domain) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 })
  if (!domain.doubtfulAt) return NextResponse.json({ error: "Domain ini tidak ditandai ragu-ragu" }, { status: 400 })

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.domain.update({ where: { id }, data: { doubtfulAt: null, doubtfulReason: null, doubtfulById: null } })

    await tx.billingFollowUp.updateMany({ where: { refType: "domain", refId: id, writeOffAt: { not: null } }, data: { writeOffAt: null } })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "domain_unmark_doubtful",
        entityType: "domain",
        entityId: id,
        metadataJson: { domainName: domain.name, clientName: domain.client?.name ?? null, previousReason: domain.doubtfulReason },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}
