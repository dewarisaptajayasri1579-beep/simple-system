import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { getVpsDockerDiskUsage } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

/** Trigger manual cek breakdown disk Docker (lambat, ~20-25 detik) untuk 1 VPS, simpan hasilnya
 *  ke cache — cuma Owner. Tombol "Cek Sekarang" di UI manggil ini, bukan GET /api/monitoring/vps
 *  (yang sengaja baca dari cache biar cepat, lihat komentar di situ). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa trigger cek ini" }, { status: 403 })

  const { id } = await params
  const vps = await prisma.vpsServer.findUnique({ where: { id } })
  if (!vps) return NextResponse.json({ error: "VPS tidak ditemukan" }, { status: 404 })

  const result = await getVpsDockerDiskUsage(vps)
  if (!result.dockerDisk) {
    return NextResponse.json({ error: result.dockerDiskError || "Gagal membaca disk Docker" }, { status: 502 })
  }

  await prisma.vpsServer.update({
    where: { id },
    data: {
      dockerDiskCache: { dockerDisk: result.dockerDisk, appDiskUsage: result.appDiskUsage ?? [] },
      dockerDiskCheckedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
