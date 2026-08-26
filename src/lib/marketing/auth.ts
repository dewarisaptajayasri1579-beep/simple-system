import { getApiUser } from "@/lib/current-user"

/** Sama pola dengan getCurrentUser("marketing") tapi buat Route Handler (API) — getApiUser()
 *  sendiri tidak ngecek modul (lihat komentarnya), jadi tiap endpoint modul Marketing yang perlu
 *  gating panggil ini. Owner selalu bypass, sama seperti di getCurrentUser. */
export async function getMarketingApiUser() {
  const user = await getApiUser()
  if (!user) return null
  if (user.role !== "owner" && !user.modules.includes("marketing")) return null
  return user
}
