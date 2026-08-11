import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

// Periode standar yang dipakai form Maintenance (per 1/2/3/6/12 bulan) — nama-nama ini yang
// dibaca periodNameToMonths() di lib/recurring-bill-status.ts. BillingPeriod.name bukan kolom
// unique (data lama hasil migrasi legacy bisa punya nama ganda), jadi "ensure exists" di bawah
// pakai findFirst per nama, bukan upsert by name.
const DEFAULT_PERIODS: { name: string; reminderDaysBefore: number }[] = [
  { name: "Mingguan", reminderDaysBefore: 2 },
  { name: "Bulanan", reminderDaysBefore: 7 },
  { name: "2 Bulanan", reminderDaysBefore: 14 },
  { name: "3 Bulanan", reminderDaysBefore: 20 },
  { name: "6 Bulanan", reminderDaysBefore: 20 },
  { name: "Tahunan", reminderDaysBefore: 30 },
]

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  for (const p of DEFAULT_PERIODS) {
    const exists = await prisma.billingPeriod.findFirst({ where: { name: p.name } })
    if (!exists) await prisma.billingPeriod.create({ data: p })
  }

  const periods = await prisma.billingPeriod.findMany({
    where: { name: { in: DEFAULT_PERIODS.map((p) => p.name) } },
  })
  const order = DEFAULT_PERIODS.map((p) => p.name)
  periods.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))

  return NextResponse.json(periods)
}
