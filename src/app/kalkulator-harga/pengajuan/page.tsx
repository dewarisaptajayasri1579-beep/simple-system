import { headers } from "next/headers"

import { AppLayout } from "@/components/layout/AppLayout"
import { PengajuanPanel, type PengajuanRow } from "@/components/kalkulator-harga/PengajuanPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Pengajuan terus bertambah — ambil yang terbaru saja. */
const LIMIT = 50

export default async function PengajuanPage() {
  const user = await getCurrentUser()

  const [requests, setting, headerList] = await Promise.all([
    prisma.workRequest.findMany({
      where: { status: "posted" },
      orderBy: { postedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        clientName: true,
        programmerName: true,
        status: true,
        postedAt: true,
        createdAt: true,
        totalPoints: true,
        totalPrice: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.workRequestSetting.findUnique({ where: { id: "default" }, select: { passwordHash: true } }),
    headers(),
  ])

  const host = headerList.get("host") ?? "localhost:3000"
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const formUrl = `${proto}://${host}/form/pekerjaan`

  const rows: PengajuanRow[] = requests.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    programmerName: r.programmerName,
    status: r.status,
    postedAtIso: r.postedAt?.toISOString() ?? null,
    createdAtIso: r.createdAt.toISOString(),
    itemCount: r._count.items,
    totalPoints: r.totalPoints,
    totalPrice: r.totalPrice,
  }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pengajuan Pekerjaan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Daftar pekerjaan yang diposting programmer lewat form — lengkap dengan bobot dan harganya.
          </p>
        </div>

        <PengajuanPanel
          rows={rows}
          formUrl={formUrl}
          passwordSet={!!setting?.passwordHash}
          canManage={["owner", "direktur"].includes(user.role)}
        />
      </div>
    </AppLayout>
  )
}
