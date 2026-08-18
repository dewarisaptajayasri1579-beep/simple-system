import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** "Nonaktifkan" (tombol Aksi di Dashboard > Domain) — langsung hilang dari Dashboard (query
 *  di sana selalu filter active:true) begitu halaman di-refresh. Alasan wajib diisi & dicatat
 *  di DeactivationLog (Pengaturan > Log Nonaktif), sama pola dengan deactivateDomain di
 *  agent-tools.ts (AI Agent WhatsApp) — cuma jalur pemicunya beda (tombol UI, bukan chat). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa nonaktifkan domain" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (!reason) return NextResponse.json({ error: "Alasan nonaktif wajib diisi" }, { status: 400 })

  const domain = await prisma.domain.findUnique({ where: { id } })
  if (!domain) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 })
  if (!domain.active) return NextResponse.json({ error: "Domain ini sudah nonaktif" }, { status: 400 })

  await prisma.$transaction([
    prisma.domain.update({ where: { id }, data: { active: false } }),
    prisma.deactivationLog.create({
      data: {
        entityType: "domain",
        entityName: domain.name,
        reason,
        actorId: user.id,
        actorName: user.name,
        command: "Dashboard > Domain (tombol Nonaktifkan)",
      },
    }),
  ])

  return NextResponse.json({ ok: true })
}
