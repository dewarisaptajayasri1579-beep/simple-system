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
