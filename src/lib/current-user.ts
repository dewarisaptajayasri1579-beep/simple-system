import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth"

export type Role = "owner" | "direktur" | "admin"
export type ModuleKey = "internal" | "marketing" | "monitoring"

export const MODULE_LABEL: Record<ModuleKey, string> = {
  internal: "Internal",
  marketing: "Marketing (Kelola Lead)",
  monitoring: "Monitoring Server",
}

/** User yang sedang login DAN boleh masuk ke `module` ini — redirect ke /login kalau belum
 *  login, redirect ke /modules kalau login tapi tidak punya akses modul tersebut. Default
 *  "internal" supaya SEMUA pemanggil lama (puluhan halaman Internal yang sudah ada) otomatis
 *  ke-gate tanpa perlu diubah satu-satu — cukup pemanggil BARU dari modul Marketing/Monitoring
 *  yang perlu eksplisit kirim `module`-nya. Owner selalu bypass (lihat User.modules di
 *  schema.prisma) — sama pola dengan isOwner check di tempat lain di app ini. */
export async function getCurrentUser(module: ModuleKey = "internal") {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.role !== "owner" && !user.modules.includes(module)) redirect("/modules")
  return user
}

/** Untuk Route Handlers (API) — tidak bisa pakai redirect(), jadi kembalikan null saja. Tidak
 *  ada gate modul di sini (beda dari getCurrentUser) — API route yang butuh itu cek sendiri
 *  lewat user.modules, karena respons API harus JSON error, bukan redirect. */
export async function getApiUser() {
  return getSessionUser()
}

/** Redirect ke /dashboard kalau role user tidak termasuk yang diizinkan — dipanggil di awal
 *  server component page yang dibatasi role (mis. Pengaturan cuma untuk owner). Modul Internal
 *  (lihat getCurrentUser) sudah otomatis ikut ke-cek di sini juga. */
export async function requirePageRole(allowed: Role[]) {
  const user = await getCurrentUser()
  if (!allowed.includes(user.role as Role)) redirect("/dashboard")
  return user
}
