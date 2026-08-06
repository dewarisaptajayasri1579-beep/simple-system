import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const accounts = await prisma.chartOfAccount.findMany({
    include: { parent: true },
    orderBy: { code: "asc" },
  })
  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola COA" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const code = typeof body?.code === "string" ? body.code.trim() : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const type = ["asset", "liability", "equity", "revenue", "cogs", "expense"].includes(body?.type) ? body.type : ""
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null
  const isParent = typeof body?.isParent === "boolean" ? body.isParent : false

  if (!code) return NextResponse.json({ error: "Kode akun wajib diisi" }, { status: 400 })
  if (!name) return NextResponse.json({ error: "Nama akun wajib diisi" }, { status: 400 })
  if (!type) return NextResponse.json({ error: "Jenis akun wajib dipilih" }, { status: 400 })

  const existing = await prisma.chartOfAccount.findUnique({ where: { code } })
  if (existing) return NextResponse.json({ error: `Kode akun "${code}" sudah dipakai` }, { status: 400 })

  const account = await prisma.chartOfAccount.create({
    data: { code, name, type, parentId, isParent },
    include: { parent: true },
  })
  return NextResponse.json(account, { status: 201 })
}
