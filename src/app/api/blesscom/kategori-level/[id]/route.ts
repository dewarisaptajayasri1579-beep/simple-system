import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

const EDIT_ROLES = ["owner", "direktur"]

/**
 * PATCH — ubah satu baris daftar harga Blesscom: nama level, keterangan, dan/atau harganya.
 *
 * Dipakai juga untuk MEMASUKKAN level pricelist yang sudah ada ke daftar Blesscom (kirim `price`
 * untuk item yang `blesscomPrice`-nya masih null) — supaya tidak lahir baris kembar untuk level
 * yang sebenarnya sudah ada di pricelist umum.
 *
 * `price` (harga umum turunan rubrik bobot) sengaja TIDAK disentuh dari sini — lihat komentar
 * WorkPriceItem.blesscomPrice: dua harga itu berdiri sendiri.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!EDIT_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengubah daftar kategori & level" }, { status: 403 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { categoryName?: string; levelName?: string; description?: string | null; price?: number }
    | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const existing = await prisma.workPriceItem.findUnique({
    where: { id },
    select: { id: true, groupName: true, level: true },
  })
  if (!existing) return NextResponse.json({ error: "Level tidak ditemukan" }, { status: 404 })

  const categoryName = body.categoryName?.trim()
  const levelName = body.levelName?.trim()
  if (body.categoryName !== undefined && !categoryName) {
    return NextResponse.json({ error: "Kategori wajib diisi" }, { status: 400 })
  }
  if (body.levelName !== undefined && !levelName) {
    return NextResponse.json({ error: "Nama level wajib diisi" }, { status: 400 })
  }

  const groupName = categoryName ?? existing.groupName
  const level = levelName ?? existing.level

  if (groupName !== existing.groupName || level !== existing.level) {
    const duplikat = await prisma.workPriceItem.findFirst({
      where: { groupName, level, blesscomPrice: { not: null }, id: { not: id } },
      select: { id: true },
    })
    if (duplikat) {
      return NextResponse.json({ error: `"${groupName} — ${level}" sudah ada di daftar Blesscom` }, { status: 409 })
    }
  }

  const item = await prisma.workPriceItem.update({
    where: { id },
    data: {
      ...(categoryName ? { groupName: categoryName } : {}),
      ...(levelName ? { level: levelName, label: `${groupName} — ${levelName}` } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.price !== undefined ? { blesscomPrice: Math.max(0, Math.round(Number(body.price) || 0)) } : {}),
    },
    select: { id: true, groupName: true, level: true, label: true, description: true, blesscomPrice: true },
  })
  return NextResponse.json(item)
}

/**
 * DELETE — keluarkan level dari daftar harga Blesscom (`blesscomPrice` dikosongkan), BUKAN hapus
 * baris pricelist-nya. Alasannya: barisnya dipakai bersama pricelist umum (menu Acuan Level /
 * Kalkulator Harga) dan boleh jadi sudah dirujuk transaksi pekerjaan lama. Dampaknya level ini
 * berhenti ditawarkan di menu Blesscom, dan bisa dimasukkan lagi kapan saja dengan mengisi
 * harganya ulang.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!EDIT_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengubah daftar kategori & level" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.workPriceItem.findUnique({ where: { id }, select: { blesscomPrice: true } })
  if (!existing) return NextResponse.json({ error: "Level tidak ditemukan" }, { status: 404 })
  if (existing.blesscomPrice === null) {
    return NextResponse.json({ error: "Level ini sudah tidak ada di daftar Blesscom" }, { status: 409 })
  }

  await prisma.workPriceItem.update({ where: { id }, data: { blesscomPrice: null } })
  return NextResponse.json({ ok: true })
}
