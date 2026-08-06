import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const rows = await prisma.legacySalesClient.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(rows)
}
