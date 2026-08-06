import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get("clientId")

  const domains = await prisma.domain.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(domains)
}
