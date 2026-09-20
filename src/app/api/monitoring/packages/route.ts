import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { prisma } from "@/lib/prisma"

function serialize(pkg: { id: string; name: string; diskSpaceBytes: bigint; bandwidthBytes: bigint }) {
  return { id: pkg.id, name: pkg.name, diskSpaceBytes: pkg.diskSpaceBytes.toString(), bandwidthBytes: pkg.bandwidthBytes.toString() }
}

/** Daftar master paket kuota Disk Space + Bandwidth — dipakai buat dropdown "Paket" di form
 *  Tambah/Edit Aplikasi, dan dibaca ulang di GET /api/monitoring/vps buat cek pemakaian aktual
 *  vs kuota (lihat computeVpsHealth di VpsMonitoring.tsx). */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const packages = await prisma.monitoringPackage.findMany({ orderBy: { diskSpaceBytes: "asc" } })
  return NextResponse.json(packages.map(serialize))
}

/** Tambah paket baru — cuma Owner/Sys Administrator. Disk/bandwidth dikirim dalam GB dari form,
 *  dikonversi ke bytes (BigInt) di sini biar presisi perbandingan di computeVpsHealth pas. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa tambah paket" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const diskSpaceGb = Number(body?.diskSpaceGb)
  const bandwidthGb = Number(body?.bandwidthGb)
  if (!name || !Number.isFinite(diskSpaceGb) || diskSpaceGb <= 0 || !Number.isFinite(bandwidthGb) || bandwidthGb <= 0) {
    return NextResponse.json({ error: "Nama, Disk Space, dan Bandwidth (GB, angka positif) wajib diisi" }, { status: 400 })
  }

  const created = await prisma.monitoringPackage.create({
    data: {
      name,
      diskSpaceBytes: BigInt(Math.round(diskSpaceGb * 1024 ** 3)),
      bandwidthBytes: BigInt(Math.round(bandwidthGb * 1024 ** 3)),
    },
  })
  return NextResponse.json(serialize(created), { status: 201 })
}
