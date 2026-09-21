import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth"
import { getApiUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"

/** Modul Meta Ads sengaja TIDAK pakai sistem centang User.modules seperti modul lain — akses
 *  lihat dashboard-nya mengikuti role di Tim Marketing (lib/marketing/permissions.ts): Owner
 *  (bypass biasa) dan SPV. SALES dan Manager-non-owner TIDAK termasuk (disepakati eksplisit,
 *  beda dari `canActOnLead` yang menyamakan MANAGER & SPV). Kredensial API (Pengaturan > Meta
 *  Ads) tetap Owner-only — lihat POST/PUT/DELETE di api/meta-ads/settings/route.ts. */
export async function canViewMetaAds(user: { id: string; role: string }): Promise<boolean> {
  if (user.role === "owner") return true
  const marketingRole = await resolveMarketingRole(user.id, user.role)
  return marketingRole === "SPV"
}

/** Untuk Server Component (page/layout) — redirect ke /login kalau belum login, ke /modules
 *  kalau login tapi bukan Owner/SPV. Dipakai di meta-ads/(shell)/layout.tsx, jadi berlaku buat
 *  semua halaman modul ini sekaligus. Sengaja tidak lewat getCurrentUser() (itu gate berdasarkan
 *  User.modules) — Meta Ads gate-nya berdasarkan role Tim Marketing, bukan centang modul. */
export async function requireMetaAdsUser() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!(await canViewMetaAds(user))) redirect("/modules")
  return user
}

/** Untuk Route Handler (API) — null kalau belum login ATAU tidak punya akses (pemanggil cukup
 *  balas 401/403 generik, sama pola dengan getApiUser() di modul lain). */
export async function getMetaAdsApiUser() {
  const user = await getApiUser()
  if (!user) return null
  if (!(await canViewMetaAds(user))) return null
  return user
}
