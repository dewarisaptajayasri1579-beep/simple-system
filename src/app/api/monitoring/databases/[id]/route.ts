import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa hapus database" }, { status: 403 })

  const { id } = await params
  await prisma.monitoredDatabase.delete({ where: { id } }).catch(() => null)

  return NextResponse.json({ ok: true })
}
