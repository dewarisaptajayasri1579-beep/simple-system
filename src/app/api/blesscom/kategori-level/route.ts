import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Sama dengan PATCH acuan harga: admin boleh membaca, tapi tidak mengubah angka kesepakatan. */
const EDIT_ROLES = ["owner", "direktur"]

/**
 * Tambah kategori/level baru ke daftar harga Blesscom.
 *
 * Barisnya tetap WorkPriceItem (satu master pricelist pekerjaan) — yang menandai dia "ada di
 * daftar Blesscom" adalah `blesscomPrice` terisi, lihat komentar field itu di schema.prisma.
 * `price` (harga umum turunan rubrik bobot) diisi sama dengan harga Blesscom sebagai titik awal
 * dan `weightPoints` dibiarkan null — artinya level ini belum dinilai pakai rubrik 8 parameter;
 * kalibrasinya menyusul dari menu Acuan Level kalau memang mau dipakai di luar Blesscom.
 */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!EDIT_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengubah daftar kategori & level" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { categoryName?: string; levelName?: string; description?: string; price?: number }
    | null

  const categoryName = body?.categoryName?.trim()
  const levelName = body?.levelName?.trim()
  // Harga 0 diizinkan = "level ini ada, harganya belum disepakati" — kondisi yang memang ada di
  // hargablesscom.md (mis. dulu TRANSAKSI LEV 4/5 & UPDATE KOLOM belum berharga).
  const price = Math.max(0, Math.round(Number(body?.price) || 0))

  if (!categoryName) return NextResponse.json({ error: "Kategori wajib diisi" }, { status: 400 })
  if (!levelName) return NextResponse.json({ error: "Nama level wajib diisi" }, { status: 400 })

  const duplikat = await prisma.workPriceItem.findFirst({
    where: { groupName: categoryName, level: levelName, blesscomPrice: { not: null } },
    select: { id: true },
  })
  if (duplikat) {
    return NextResponse.json({ error: `"${categoryName} — ${levelName}" sudah ada di daftar Blesscom` }, { status: 409 })
  }

  // Nomor urut lanjut dari level terakhir di kategori yang sama (urutan tampilan memang per kategori).
  const last = await prisma.workPriceItem.findFirst({
    where: { groupName: categoryName },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })

  const item = await prisma.workPriceItem.create({
    data: {
      groupName: categoryName,
      level: levelName,
      label: `${categoryName} — ${levelName}`,
      description: body?.description?.trim() || null,
      price,
      blesscomPrice: price,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  })

  return NextResponse.json(item, { status: 201 })
}
