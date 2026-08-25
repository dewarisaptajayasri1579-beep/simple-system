import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Daftar akun COA yang boleh dilihat 1 role di Akuntansi > Buku Besar (lihat RoleCoaAccess di
 *  schema.prisma) — Owner/Direktur selalu bebas lihat semua, ini cuma buat role dibatasi
 *  ("admin"). ?role=admin wajib diisi. */
export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa lihat pengaturan ini" }, { status: 403 })

  const role = new URL(request.url).searchParams.get("role")
  if (!role) return NextResponse.json({ error: "Parameter role wajib diisi" }, { status: 400 })

  const rows = await prisma.roleCoaAccess.findMany({ where: { role }, select: { coaAccountId: true } })
  return NextResponse.json({ role, coaAccountIds: rows.map((r) => r.coaAccountId) })
}

/** Ganti TOTAL daftar akun untuk 1 role (hapus semua baris lama punya role itu, buat ulang dari
 *  coaAccountIds yang dikirim) — lebih sederhana daripada diff tambah/kurang satu-satu, dan
 *  aman karena cuma menyangkut 1 role dalam 1 request (tidak menyentuh baris role lain). */
export async function PUT(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa ubah pengaturan ini" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const role = typeof body?.role === "string" ? body.role : ""
  const coaAccountIds: string[] = Array.isArray(body?.coaAccountIds) ? body.coaAccountIds.filter((v: unknown) => typeof v === "string") : []

  if (!role) return NextResponse.json({ error: "Role wajib diisi" }, { status: 400 })

  await prisma.$transaction([
    prisma.roleCoaAccess.deleteMany({ where: { role } }),
    prisma.roleCoaAccess.createMany({ data: coaAccountIds.map((coaAccountId) => ({ role, coaAccountId })) }),
  ])

  return NextResponse.json({ role, coaAccountIds })
}
