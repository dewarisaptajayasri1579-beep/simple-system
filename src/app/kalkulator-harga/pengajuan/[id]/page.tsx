import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { PengajuanDetail } from "@/components/kalkulator-harga/PengajuanDetail"
import { Button } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function PengajuanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const req = await prisma.workRequest.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  })
  if (!req) notFound()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <Link href="/kalkulator-harga/pengajuan">
            <Button variant="ghost" size="sm" aria-label="Kembali">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight truncate">
              {req.clientName || "(tanpa nama client)"}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Diajukan {req.programmerName || "(programmer tidak diisi)"}
              {req.postedAt ? ` · ${req.postedAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}` : ""}
            </p>
          </div>
        </div>

        <PengajuanDetail
          totalPoints={req.totalPoints}
          totalPrice={req.totalPrice}
          items={req.items.map((it) => ({
            id: it.id,
            nama: it.nama,
            qty: it.qty,
            summary: it.summary,
            reason: it.reason,
            points: it.points,
            unitPrice: it.unitPrice,
            scores: (it.scores ?? {}) as Record<string, string>,
            transcript: Array.isArray(it.transcript) ? (it.transcript as { role: string; text: string }[]) : [],
          }))}
        />
      </div>
    </AppLayout>
  )
}
