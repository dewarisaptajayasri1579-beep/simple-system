import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      items: { include: { employee: { select: { id: true, name: true, position: true } } }, orderBy: { employee: { name: "asc" } } },
      transaction: { select: { id: true, transactionNumber: true, postStatus: true } },
    },
  })
  if (!period) return NextResponse.json({ error: "Periode tidak ditemukan" }, { status: 404 })

  return NextResponse.json({ period })
}
