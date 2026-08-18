import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola COA" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.isParent === "boolean") data.isParent = body.isParent
  if (typeof body.isActive === "boolean") data.isActive = body.isActive
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body.type === "string" && ["asset", "liability", "equity", "revenue", "cogs", "expense"].includes(body.type)) data.type = body.type
  if (typeof body.parentId === "string") data.parentId = body.parentId || null

  const account = await prisma.chartOfAccount.update({ where: { id }, data })
  return NextResponse.json(account)
}

/** Hapus akun COA — cuma boleh kalau bukan parent, belum ada history jurnal (draft maupun
 *  posted, sekali pernah kepakai berarti sudah "kotor" jejaknya), dan tidak lagi dipetakan ke
 *  akun kas/bank atau kategori manapun. Dipasang di modal Edit CoaList (tombol Hapus cuma
 *  tampil kalau front-end sudah tahu row ini eligible — guard di sini jaga-jaga sisi server). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola COA" }, { status: 403 })

  const { id } = await params
  const account = await prisma.chartOfAccount.findUnique({
    where: { id },
    include: {
      children: { select: { id: true } },
      journalLines: { select: { id: true } },
      accounts: { select: { id: true } },
      categories: { select: { id: true } },
    },
  })
  if (!account) return NextResponse.json({ error: "Akun COA tidak ditemukan" }, { status: 404 })
  if (account.isParent || account.children.length > 0) {
    return NextResponse.json({ error: "Akun ini masih punya sub-akun — hapus/pindahkan sub-akunnya dulu" }, { status: 400 })
  }
  if (account.journalLines.length > 0) {
    return NextResponse.json({ error: "Akun ini sudah punya history transaksi — tidak bisa dihapus" }, { status: 400 })
  }
  if (account.accounts.length > 0) {
    return NextResponse.json({ error: "Akun ini masih dipetakan ke akun kas/bank — lepaskan mapping-nya dulu" }, { status: 400 })
  }
  if (account.categories.length > 0) {
    return NextResponse.json({ error: "Akun ini masih dipetakan ke kategori — lepaskan mapping-nya dulu" }, { status: 400 })
  }

  await prisma.chartOfAccount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
