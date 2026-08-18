import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Isi/ubah No. & Tanggal Bukti Pungut PPN — CATATAN saja (lihat Invoice.noBuktiPungutPpn),
 *  tidak ada efek jurnal, jadi boleh diedit kapan saja (draft/posted/voided), beda dari
 *  PATCH /api/invoices/[id] yang cuma untuk draft. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const noBuktiPungutPpn = typeof body?.noBuktiPungutPpn === "string" ? body.noBuktiPungutPpn.trim() || null : null
  const tglBuktiPungutPpn = typeof body?.tglBuktiPungutPpn === "string" && body.tglBuktiPungutPpn ? new Date(body.tglBuktiPungutPpn) : null

  const updated = await prisma.invoice.update({
    where: { id },
    data: { noBuktiPungutPpn, tglBuktiPungutPpn },
  })
  return NextResponse.json(updated)
}
