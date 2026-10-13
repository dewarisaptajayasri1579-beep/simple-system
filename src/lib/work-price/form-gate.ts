import { cookies } from "next/headers"

import { prisma } from "@/lib/prisma"

/** Cookie akses form pengajuan — TERPISAH dari `session_id` milik user internal, supaya
 *  programmer yang membuka form tidak pernah dianggap login ke sistem internal. */
const FORM_COOKIE = "work_form_session"
const FORM_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari

export async function createFormSession() {
  const session = await prisma.workFormSession.create({
    data: { expiresAt: new Date(Date.now() + FORM_TTL_MS) },
  })

  const cookieStore = await cookies()
  cookieStore.set(FORM_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  })

  return session
}

/** True kalau browser ini sudah pernah memasukkan password form dan sesinya belum kedaluwarsa. */
export async function hasFormAccess(): Promise<boolean> {
  const cookieStore = await cookies()
  const id = cookieStore.get(FORM_COOKIE)?.value
  if (!id) return false

  const session = await prisma.workFormSession.findUnique({ where: { id }, select: { expiresAt: true } })
  return !!session && session.expiresAt > new Date()
}

export async function destroyFormSession() {
  const cookieStore = await cookies()
  const id = cookieStore.get(FORM_COOKIE)?.value
  if (id) await prisma.workFormSession.delete({ where: { id } }).catch(() => {})
  cookieStore.delete(FORM_COOKIE)
}

/** Null kalau Owner belum pernah menetapkan password — form ditutup sampai itu diisi. */
export async function getFormPasswordHash(): Promise<string | null> {
  const setting = await prisma.workRequestSetting.findUnique({ where: { id: "default" }, select: { passwordHash: true } })
  return setting?.passwordHash ?? null
}
