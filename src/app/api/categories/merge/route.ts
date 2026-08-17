import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Gabung beberapa kategori duplikat (mis. "Listrik" & "Bayar Listrik") jadi satu — transaksi
 *  yang sudah tercatat di kategori sumber dipindah ke kategori tujuan, lalu kategori sumber
 *  dihapus. Dipakai dari menu Pengaturan > Kategori buat quick cleanup. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menggabung kategori" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const targetId = typeof body?.targetId === "string" ? body.targetId : ""
  const sourceIds: string[] = Array.isArray(body?.sourceIds)
    ? body.sourceIds.filter((v: unknown): v is string => typeof v === "string" && v !== targetId)
    : []

  if (!targetId) return NextResponse.json({ error: "Kategori tujuan wajib dipilih" }, { status: 400 })
  if (sourceIds.length === 0) return NextResponse.json({ error: "Pilih minimal 1 kategori sumber untuk digabung" }, { status: 400 })

  const categories = await prisma.category.findMany({ where: { id: { in: [targetId, ...sourceIds] } } })
  const target = categories.find((c) => c.id === targetId)
  if (!target) return NextResponse.json({ error: "Kategori tujuan tidak ditemukan" }, { status: 404 })
  if (categories.some((c) => c.kind !== target.kind)) {
    return NextResponse.json({ error: "Kategori yang digabung harus jenis (pendapatan/biaya/HPP) yang sama" }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.transaction.updateMany({ where: { categoryId: { in: sourceIds } }, data: { categoryId: targetId } }),
    prisma.category.deleteMany({ where: { id: { in: sourceIds } } }),
  ])

  return NextResponse.json({ ok: true, mergedCount: sourceIds.length })
}
