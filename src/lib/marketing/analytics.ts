import { prisma } from "@/lib/prisma"
import { startOfToday } from "@/lib/marketing/follow-up"

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export interface TeamMemberStats {
  userId: string
  name: string
  activeLeads: number
  hotLeads: number
  followUpToday: number
  followUpOverdue: number
  unrepliedChats: number
  wonThisMonth: number
  followUpCompletedThisMonth: number
  followUpOnTimeThisMonth: number
}

/** Agregat per user Marketing (owner + modules has "marketing"). Semua lewat groupBy/count di DB
 *  — tidak ada query di dalam loop. */
export async function buildTeamAggregates(): Promise<TeamMemberStats[]> {
  const sot = startOfToday()
  const som = startOfMonth()

  const users = await prisma.user.findMany({
    where: { isActive: true, OR: [{ role: "owner" }, { modules: { has: "marketing" } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  const [active, hot, fuToday, fuOverdue, won, fuDone, fuOnTime, unreadConvs] = await Promise.all([
    prisma.leadAssignment.groupBy({
      by: ["assignedUserId"],
      where: { isActive: true, lead: { outcome: "OPEN" } },
      _count: true,
    }),
    prisma.leadAssignment.groupBy({
      by: ["assignedUserId"],
      where: { isActive: true, lead: { outcome: "OPEN", temperature: "HOT" } },
      _count: true,
    }),
    prisma.leadFollowUp.groupBy({
      by: ["assignedUserId"],
      where: { status: "OPEN", scheduledAt: { gte: sot, lte: new Date(sot.getTime() + 86400000 - 1) } },
      _count: true,
    }),
    prisma.leadFollowUp.groupBy({
      by: ["assignedUserId"],
      where: { status: "OPEN", scheduledAt: { lt: sot } },
      _count: true,
    }),
    // Won bulan ini diatribusikan ke `closedByUserId` (PIC pada detik closing), SAMA dengan
    // Laporan Performa Sales — bukan ke PIC aktif sekarang, supaya takeover setelah deal tidak
    // memindahkan kredit closing. Fallback ke PIC aktif cuma buat baris lama sebelum kolom itu
    // ada. Sengaja findMany + hitung di JS (bukan groupBy) karena butuh fallback dua kolom;
    // jumlahnya terbatas (cuma WON bulan berjalan).
    prisma.lead.findMany({
      where: { outcome: "WON", wonAt: { gte: som } },
      select: { closedByUserId: true, assignments: { where: { isActive: true }, select: { assignedUserId: true } } },
    }),
    prisma.leadFollowUp.groupBy({
      by: ["assignedUserId"],
      where: { status: "COMPLETED", completedAt: { gte: som } },
      _count: true,
    }),
    prisma.leadFollowUp.groupBy({
      by: ["assignedUserId"],
      where: { status: "COMPLETED", completedAt: { gte: som }, isOnTime: true },
      _count: true,
    }),
    prisma.conversation.findMany({
      where: { unreadCustomerCount: { gt: 0 } },
      select: { lead: { select: { assignments: { where: { isActive: true }, select: { assignedUserId: true } } } } },
    }),
  ])

  const map = (rows: { assignedUserId: string; _count: number }[]) =>
    new Map(rows.map((r) => [r.assignedUserId, typeof r._count === "number" ? r._count : 0]))
  const mActive = map(active as never)
  const mHot = map(hot as never)
  const mToday = map(fuToday as never)
  const mOverdue = map(fuOverdue as never)
  const mWon = new Map<string, number>()
  for (const l of won) {
    const uid = l.closedByUserId ?? l.assignments[0]?.assignedUserId
    if (uid) mWon.set(uid, (mWon.get(uid) ?? 0) + 1)
  }
  const mDone = map(fuDone as never)
  const mOnTime = map(fuOnTime as never)

  const mUnread = new Map<string, number>()
  for (const c of unreadConvs) {
    const uid = c.lead.assignments[0]?.assignedUserId
    if (uid) mUnread.set(uid, (mUnread.get(uid) ?? 0) + 1)
  }

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    activeLeads: mActive.get(u.id) ?? 0,
    hotLeads: mHot.get(u.id) ?? 0,
    followUpToday: mToday.get(u.id) ?? 0,
    followUpOverdue: mOverdue.get(u.id) ?? 0,
    unrepliedChats: mUnread.get(u.id) ?? 0,
    wonThisMonth: mWon.get(u.id) ?? 0,
    followUpCompletedThisMonth: mDone.get(u.id) ?? 0,
    followUpOnTimeThisMonth: mOnTime.get(u.id) ?? 0,
  }))
}
