import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { endOfToday, followUpDto, startOfToday } from "@/lib/marketing/follow-up"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/marketing/follow-ups — daftar follow up untuk halaman Follow Up.
 *  scope=all|mine (default all) · bucket=today|upcoming|overdue|done|all (default today) · page/limit
 * Selalu balikin `counts` (today/upcoming/overdue) scope-aware buat badge tab.
 */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const scope = sp.get("scope") === "mine" ? "mine" : "all"
  const bucket = sp.get("bucket") ?? "today"
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50))

  const base: Prisma.LeadFollowUpWhereInput = {}
  if (scope === "mine") base.assignedUserId = user.id

  const sot = startOfToday()
  const eot = endOfToday()
  const bucketWhere: Record<string, Prisma.LeadFollowUpWhereInput> = {
    today: { status: "OPEN", scheduledAt: { gte: sot, lte: eot } },
    upcoming: { status: "OPEN", scheduledAt: { gt: eot } },
    overdue: { status: "OPEN", scheduledAt: { lt: sot } },
    done: { status: "COMPLETED" },
    all: {},
  }
  const where: Prisma.LeadFollowUpWhereInput = { ...base, ...(bucketWhere[bucket] ?? bucketWhere.today) }

  const [rows, total, cToday, cUpcoming, cOverdue] = await Promise.all([
    prisma.leadFollowUp.findMany({
      where,
      orderBy: bucket === "done" ? { completedAt: "desc" } : { scheduledAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        lead: { select: { id: true, displayName: true, companyName: true, temperature: true } },
        resultType: { select: { code: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    }),
    prisma.leadFollowUp.count({ where }),
    prisma.leadFollowUp.count({ where: { ...base, ...bucketWhere.today } }),
    prisma.leadFollowUp.count({ where: { ...base, ...bucketWhere.upcoming } }),
    prisma.leadFollowUp.count({ where: { ...base, ...bucketWhere.overdue } }),
  ])

  return NextResponse.json({
    followUps: rows.map(followUpDto),
    page,
    limit,
    total,
    counts: { today: cToday, upcoming: cUpcoming, overdue: cOverdue },
  })
}
