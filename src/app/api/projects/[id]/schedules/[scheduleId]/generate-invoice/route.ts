import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { generateTerminInvoice } from "@/lib/project-termin"

/** Manual trigger "Generate Invoice Sekarang" — untuk kasus perlu nagih lebih awal dari H-3
 *  otomatis (lihat src/lib/cron/project-termin-invoicing.ts). */
export async function POST(_request: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { scheduleId } = await params

  try {
    const result = await prisma.$transaction((tx) => generateTerminInvoice(tx, { scheduleId, createdBy: user.id }))
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal generate invoice" }, { status: 400 })
  }
}
