import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth"

export type Role = "owner" | "direktur" | "admin"

/** User yang sedang login. Redirect ke /login kalau belum login — dipakai di server component page. */
export async function getCurrentUser() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  return user
}

/** Untuk Route Handlers (API) — tidak bisa pakai redirect(), jadi kembalikan null saja. */
export async function getApiUser() {
  return getSessionUser()
}

/** Redirect ke /dashboard kalau role user tidak termasuk yang diizinkan — dipanggil di awal
 *  server component page yang dibatasi role (mis. Pengaturan cuma untuk owner). */
export async function requirePageRole(allowed: Role[]) {
  const user = await getCurrentUser()
  if (!allowed.includes(user.role as Role)) redirect("/dashboard")
  return user
}
