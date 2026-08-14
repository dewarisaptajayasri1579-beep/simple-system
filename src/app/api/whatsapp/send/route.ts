import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { sendWhatsappMessage } from "@/lib/wahub"

/** Follow-up "Otomatis" (tombol di Dashboard) — kirim langsung dari server lewat WAHUB, beda
 *  dari follow-up "Manual" yang cuma buka web.whatsapp.com di sisi client (lihat FollowUpButtons.tsx). */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const phone = typeof body?.phone === "string" ? body.phone : ""
  const message = typeof body?.message === "string" ? body.message : ""
  if (!phone) return NextResponse.json({ error: "Nomor WA tidak ada" }, { status: 400 })
  if (!message.trim()) return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 })

  try {
    await sendWhatsappMessage(phone, message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mengirim WA" }, { status: 502 })
  }
}
