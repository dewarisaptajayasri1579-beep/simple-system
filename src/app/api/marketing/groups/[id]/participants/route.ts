import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { canActOnGroup } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"
import { getWahubGroupParticipants } from "@/lib/wahub"

/** GET /api/marketing/groups/[id]/participants — info + daftar anggota grup, live dari WAHUB
 *  (tidak di-cache ke DB, selalu ambil data terbaru). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  if (!(await canActOnGroup(user, id))) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  const group = await prisma.groupChat.findUnique({
    where: { id },
    select: { groupJid: true, whatsappConnection: { select: { wahubSessionId: true } } },
  })
  if (!group) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  try {
    const info = await getWahubGroupParticipants(group.whatsappConnection.wahubSessionId, group.groupJid)
    return NextResponse.json({ info })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal ambil anggota grup" }, { status: 502 })
  }
}
