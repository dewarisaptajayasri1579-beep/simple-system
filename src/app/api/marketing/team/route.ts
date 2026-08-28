import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { buildTeamAggregates } from "@/lib/marketing/analytics"
import { prisma } from "@/lib/prisma"

/** GET /api/marketing/team — KPI per Sales + early warning. Terbuka untuk semua anggota tim
 *  (cara pandang teragregasi, bukan gerbang akses). */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const [members, hotNoFollowUp] = await Promise.all([
    buildTeamAggregates(),
    prisma.lead.findMany({
      where: { outcome: "OPEN", temperature: "HOT", followUps: { none: { status: "OPEN" } } },
      select: { assignments: { where: { isActive: true }, select: { assignedUser: { select: { id: true, name: true } } } } },
    }),
  ])

  const hotByUser = new Map<string, { name: string; count: number }>()
  for (const l of hotNoFollowUp) {
    const u = l.assignments[0]?.assignedUser
    if (!u) continue
    const cur = hotByUser.get(u.id) ?? { name: u.name, count: 0 }
    cur.count++
    hotByUser.set(u.id, cur)
  }

  const warnings: { severity: "high" | "medium"; text: string; userId: string | null; cta: { label: string; href: string } }[] = []
  for (const [uid, v] of hotByUser) {
    warnings.push({
      severity: "high",
      text: `${v.count} Hot Lead milik ${v.name} belum di-follow up`,
      userId: uid,
      cta: { label: "Lihat Lead", href: `/marketing/leads?picUserId=${uid}&temperature=HOT` },
    })
  }
  for (const m of members) {
    if (m.followUpOverdue >= 3) {
      warnings.push({
        severity: "medium",
        text: `${m.name} punya ${m.followUpOverdue} follow up terlambat`,
        userId: m.userId,
        cta: { label: "Lihat Follow Up", href: `/marketing/tim/${m.userId}` },
      })
    }
  }

  return NextResponse.json({ members, warnings })
}
