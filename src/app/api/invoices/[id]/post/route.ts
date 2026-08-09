import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Posting invoice draft: masuk Piutang resmi mulai sekarang (field biasa, bukan jurnal —
 *  lihat pedoman_akunting.md). Invoice tidak pernah bikin jurnal apa pun, jadi tidak ada yang
 *  perlu difinalisasi di sini — Pendapatan/PPN/HPP baru dijurnal saat Payment-nya diposting. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (invoice.postStatus !== "draft") return NextResponse.json({ error: "Invoice ini bukan draft (sudah diposting/dibatalkan)" }, { status: 400 })

  const posted = await prisma.$transaction(async (tx) => {
    return tx.invoice.update({
      where: { id },
      data: { postStatus: "posted", postedAt: new Date(), postedById: user.id },
      include: { client: true },
    })
  })

  return NextResponse.json(posted)
}
