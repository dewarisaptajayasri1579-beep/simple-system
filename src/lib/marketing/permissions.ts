import type { User } from "@prisma/client"

import { prisma } from "@/lib/prisma"

/**
 * Model Visibilitas & Izin modul Marketing — lihat `marketing-plan-to-do.md`
 * ("Model Visibilitas & Izin"). Ringkas:
 *  - LIHAT: semua anggota Tim (Manager/SPV/Sales) boleh lihat SEMUA lead + full chat.
 *    Tidak ada scope filter untuk operasi baca.
 *  - AKSI: hanya PIC (assignee aktif) lead itu, ATAU SPV/Manager.
 */

export type MarketingRole = "MANAGER" | "SPV" | "SALES"

/** Boleh masuk modul Marketing sama sekali? (dipakai di API route handler, sejajar dengan
 *  getCurrentUser("marketing") untuk page). Owner selalu bypass. */
export function canViewMarketing(user: Pick<User, "role" | "modules">) {
  return user.role === "owner" || user.modules.includes("marketing")
}

/** Peran efektif user di modul Marketing:
 *  - `owner` (User.role) atau manajer sebuah Team aktif → MANAGER
 *  - punya TeamMembership aktif dengan membershipRole "SPV" → SPV
 *  - selain itu → SALES
 *  MANAGER & SPV = level "atasan" (boleh aksi lintas lead). SALES = aksi hanya di lead sendiri. */
export async function resolveMarketingRole(userId: string, userRole: string): Promise<MarketingRole> {
  if (userRole === "owner") return "MANAGER"

  const [managedTeam, spvMembership] = await Promise.all([
    prisma.team.findFirst({ where: { managerUserId: userId, isActive: true }, select: { id: true } }),
    prisma.teamMembership.findFirst({
      where: { userId, activeUntil: null, membershipRole: "SPV" },
      select: { id: true },
    }),
  ])

  if (managedTeam) return "MANAGER"
  if (spvMembership) return "SPV"
  return "SALES"
}

/** Apakah user boleh MELAKUKAN AKSI (balas chat, ubah temperatur, tambah aktivitas, selesaikan
 *  follow up, ubah outcome) pada lead ini?
 *  - MANAGER / SPV → selalu boleh.
 *  - SALES → hanya kalau dia PIC lead tsb (LeadAssignment aktif atas namanya). */
export async function canActOnLead(user: Pick<User, "id" | "role">, leadId: string): Promise<boolean> {
  const role = await resolveMarketingRole(user.id, user.role)
  if (role === "MANAGER" || role === "SPV") return true

  const activeAssignment = await prisma.leadAssignment.findFirst({
    where: { leadId, assignedUserId: user.id, isActive: true },
    select: { id: true },
  })
  return activeAssignment != null
}

/** Versi batch dari `canActOnLead` — kembalikan Set berisi leadId yang boleh di-aksi user,
 *  dari daftar `leadIds` yang diberikan. Dipakai di list (inbox/lead list) supaya tidak N+1. */
export async function actableLeadIds(user: Pick<User, "id" | "role">, leadIds: string[]): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set()

  const role = await resolveMarketingRole(user.id, user.role)
  if (role === "MANAGER" || role === "SPV") return new Set(leadIds)

  const rows = await prisma.leadAssignment.findMany({
    where: { leadId: { in: leadIds }, assignedUserId: user.id, isActive: true },
    select: { leadId: true },
  })
  return new Set(rows.map((r) => r.leadId))
}
