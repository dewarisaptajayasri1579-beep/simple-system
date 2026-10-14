import Link from "next/link"
import { ChevronRight, MessageSquareText } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { PengajuanBlesscomPanel } from "@/components/blesscom/PengajuanBlesscomPanel"
import { Card } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Riwayat terus bertambah — ambil yang terbaru saja. */
const RIWAYAT_LIMIT = 20

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export default async function PengajuanBlesscomPage() {
  const user = await getCurrentUser()

  // Hanya riwayat Blesscom (kind "level") — hasil Kalkulator Harga umum yang berbasis bobot
  // sengaja tidak ikut tercampur di sini.
  const riwayat = await prisma.workPriceSimulation.findMany({
    where: { kind: "level" },
    orderBy: { createdAt: "desc" },
    take: RIWAYAT_LIMIT,
    select: {
      id: true,
      title: true,
      clientName: true,
      totalPrice: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pengajuan Pekerjaan Blesscom</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Diskusi dengan AI untuk menentukan <strong>kategori dan level</strong> pekerjaan — acuan Blesscom murni level, tanpa hitung bobot.
          </p>
        </div>

        <PengajuanBlesscomPanel />

        {riwayat.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Riwayat Pengajuan</h2>
            <ul className="flex flex-col gap-1.5">
              {riwayat.map((r) => (
                <li key={r.id}>
                  <Link href={`/kalkulator-harga/simulasi/${r.id}`}>
                    <Card variant="solid" padding="sm" hoverable className="!rounded-2xl flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
                        <MessageSquareText className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{r.title}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                          {r.clientName ? `${r.clientName} · ` : ""}
                          {r.createdAt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} · {r._count.items} pekerjaan
                        </p>
                      </div>
                      <span className="text-sm font-extrabold text-slate-900 whitespace-nowrap">{formatRupiah(r.totalPrice)}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
