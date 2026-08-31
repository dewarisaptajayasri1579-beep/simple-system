import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/** PATCH /api/marketing/whatsapp/connections/[id] — ubah nama/identitas nomor WA. Sengaja tidak
 *  ada guard status — boleh diganti kapan saja termasuk saat sudah READY, karena label cuma label
 *  tampilan (bukan bagian dari sesi WAHUB), jadi rename tidak mengganggu koneksi yang aktif. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const connection = await prisma.whatsappConnection.findUnique({ where: { id } })
  if (!connection || connection.userId !== user.id) {
    return NextResponse.json({ error: "Koneksi tidak ditemukan" }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const label: string | null = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : null
  if (!label) return NextResponse.json({ error: "Nama/identitas nomor wajib diisi" }, { status: 400 })

  const updated = await prisma.whatsappConnection.update({ where: { id: connection.id }, data: { label } })
  return NextResponse.json(updated)
}
