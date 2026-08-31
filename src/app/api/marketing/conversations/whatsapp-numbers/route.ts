import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET /api/marketing/conversations/whatsapp-numbers — opsi nomor WA untuk filter Inbox.
 *  SALES cuma lihat nomor miliknya sendiri (dia cuma boleh lihat Inbox "mine" juga). MANAGER/SPV
 *  lihat semua nomor tim, dilabeli nama pemiliknya biar kebedain kalau labelnya sama. Tidak sync
 *  status ke WAHUB di sini (beda dari /api/marketing/whatsapp/connections) — cuma buat isi dropdown. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const role = await resolveMarketingRole(user.id, user.role)

  const connections = await prisma.whatsappConnection.findMany({
    where: role === "SALES" ? { userId: user.id } : undefined,
    orderBy: [{ user: { name: "asc" } }, { createdAt: "asc" }],
    select: { id: true, label: true, phoneNumber: true, user: { select: { name: true } } },
  })

  const numbers = connections.map((c) => ({
    id: c.id,
    label: c.label ?? c.phoneNumber ?? "Nomor tanpa nama",
    ownerName: role === "SALES" ? null : c.user.name,
  }))

  return NextResponse.json({ numbers })
}
