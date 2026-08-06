import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama akun wajib diisi" }, { status: 400 })

  const account = await prisma.account.create({
    data: {
      name,
      type: body?.type === "bank" ? "bank" : "kas",
      bankName: body?.bankName || null,
      accountNumber: body?.accountNumber || null,
      openingBalance: Number(body?.openingBalance) || 0,
    },
  })

  return NextResponse.json(account, { status: 201 })
}
