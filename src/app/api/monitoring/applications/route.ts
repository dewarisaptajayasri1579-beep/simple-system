import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Tambah Application manual di bawah sebuah VpsServer — cuma Owner. Dipakai untuk VPS tanpa
 *  kredensial Coolify (sync otomatis tidak jalan) atau buat override manual. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa tambah aplikasi" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const vpsServerId = typeof body?.vpsServerId === "string" ? body.vpsServerId : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!vpsServerId || !name) {
    return NextResponse.json({ error: "VPS dan nama aplikasi wajib diisi" }, { status: 400 })
  }

  const domain = typeof body?.domain === "string" ? body.domain.trim() || null : null
  const gitRepository = typeof body?.gitRepository === "string" ? body.gitRepository.trim() || null : null
  const gitBranch = typeof body?.gitBranch === "string" ? body.gitBranch.trim() || null : null
  const backupLocation = typeof body?.backupLocation === "string" ? body.backupLocation.trim() || null : null
  const activityQuery = typeof body?.activityQuery === "string" ? body.activityQuery.trim() || null : null
  const notes = typeof body?.notes === "string" ? body.notes.trim() || null : null
  const lastBackupAt = parseDate(body?.lastBackupAt)
  const domainExpiresAt = parseDate(body?.domainExpiresAt)

  const created = await prisma.application
    .create({
      data: { vpsServerId, name, domain, gitRepository, gitBranch, backupLocation, activityQuery, notes, lastBackupAt, domainExpiresAt },
      select: { id: true },
    })
    .catch(() => null)

  if (!created) return NextResponse.json({ error: "Gagal menambah aplikasi (VPS tidak ditemukan?)" }, { status: 400 })

  return NextResponse.json(created, { status: 201 })
}
