import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/marketing/groups — daftar Grup WhatsApp. BUKAN Lead — gak ada PIC/temperature/
 * follow-up, cuma inbox baca+balas. Visibilitas: SALES cuma lihat grup yang WhatsappConnection
 * pemiliknya dia sendiri; SPV/MANAGER lihat semua.
 */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const role = await resolveMarketingRole(user.id, user.role)
  const where = role === "SALES" ? { whatsappConnection: { userId: user.id } } : {}

  const groups = await prisma.groupChat.findMany({
    where,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: {
      id: true,
      groupJid: true,
      name: true,
      lastMessageAt: true,
      unreadCount: true,
      whatsappConnection: { select: { label: true, phoneNumber: true } },
      messages: { take: 1, orderBy: { sentAt: "desc" }, select: { body: true, direction: true, messageType: true } },
    },
  })

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name || `Grup ${g.groupJid.split("@")[0].slice(-4)}`,
      whatsappConnectionLabel: g.whatsappConnection.label ?? g.whatsappConnection.phoneNumber ?? null,
      lastMessageAt: g.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: g.messages[0] ?? null,
      unreadCount: g.unreadCount,
    })),
  })
}
