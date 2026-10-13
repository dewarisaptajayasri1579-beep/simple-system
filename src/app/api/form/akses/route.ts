import { NextResponse } from "next/server"

import { verifyPassword } from "@/lib/auth"
import { createFormSession, getFormPasswordHash } from "@/lib/work-price/form-gate"

/** Gerbang form pengajuan: password dipakai bersama semua programmer, identitas orangnya baru
 *  ditulis di dalam form. Berhasil → cookie sesi form (bukan sesi user internal). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null
  const password = body?.password ?? ""
  if (!password) return NextResponse.json({ error: "Password wajib diisi" }, { status: 400 })

  const hash = await getFormPasswordHash()
  if (!hash) return NextResponse.json({ error: "Form belum dibuka — hubungi admin untuk mengatur password" }, { status: 503 })

  if (!verifyPassword(password, hash)) {
    return NextResponse.json({ error: "Password salah" }, { status: 401 })
  }

  await createFormSession()
  return NextResponse.json({ ok: true })
}
