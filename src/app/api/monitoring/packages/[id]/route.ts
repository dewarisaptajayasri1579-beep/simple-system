import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Edit paket — cuma Owner/Sys Administrator. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa edit paket" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (body.diskSpaceGb !== undefined) {
    const diskSpaceGb = Number(body.diskSpaceGb)
    if (!Number.isFinite(diskSpaceGb) || diskSpaceGb <= 0) return NextResponse.json({ error: "Disk Space harus angka positif" }, { status: 400 })
    data.diskSpaceBytes = BigInt(Math.round(diskSpaceGb * 1024 ** 3))
  }
  if (body.bandwidthGb !== undefined) {
    const bandwidthGb = Number(body.bandwidthGb)
    if (!Number.isFinite(bandwidthGb) || bandwidthGb <= 0) return NextResponse.json({ error: "Bandwidth harus angka positif" }, { status: 400 })
    data.bandwidthBytes = BigInt(Math.round(bandwidthGb * 1024 ** 3))
  }

  const updated = await prisma.monitoringPackage.update({ where: { id }, data }).catch(() => null)
  if (!updated) return NextResponse.json({ error: "Paket tidak ditemukan" }, { status: 404 })

  return NextResponse.json({ id: updated.id, name: updated.name, diskSpaceBytes: updated.diskSpaceBytes.toString(), bandwidthBytes: updated.bandwidthBytes.toString() })
}

/** Hapus paket — cuma Owner/Sys Administrator. Aplikasi yang masih pakai paket ini otomatis balik
 *  ke "Tanpa Paket" (packageId jadi null, lihat onDelete default SetNull tidak di-set eksplisit —
 *  Prisma default-nya Restrict, jadi di-lepas manual dulu di sini supaya hapus tidak gagal). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa hapus paket" }, { status: 403 })

  const { id } = await params
  await prisma.application.updateMany({ where: { packageId: id }, data: { packageId: null } })
  await prisma.monitoringPackage.delete({ where: { id } }).catch(() => null)

  return NextResponse.json({ ok: true })
}
