import { NextResponse } from "next/server"

import { encryptSecret } from "@/lib/crypto"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Set/timpa token PAT GitHub 1 Git App/Source — cuma Owner/Admin/Sys Administrator, sama seperti
 *  pembatasan akses Domain/Server di modul Monitoring (data ini sensitif: token GitHub akun
 *  pribadi/klien). Token dienkripsi sebelum disimpan, pola sama seperti coolifyApiToken/
 *  enhanceApiToken (lihat src/lib/crypto.ts). Kirim token kosong ("") untuk menghapus token. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "admin" && user.role !== "sysadmin") {
    return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const token = typeof body?.token === "string" ? body.token.trim() : null
  if (token === null) return NextResponse.json({ error: "Token wajib diisi" }, { status: 400 })

  const existing = await prisma.githubSource.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: "Git App tidak ditemukan" }, { status: 404 })

  await prisma.githubSource.update({
    where: { id },
    data: token ? { token: encryptSecret(token), tokenSetAt: new Date() } : { token: null, tokenSetAt: null },
  })

  return NextResponse.json({ ok: true })
}
