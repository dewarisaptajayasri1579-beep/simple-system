import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ lastLoginAt: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, lastLoginAt: true },
  })

  return NextResponse.json(users)
}
