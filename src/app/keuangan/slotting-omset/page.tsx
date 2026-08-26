import { AppLayout } from "@/components/layout/AppLayout"
import { SlottingOmsetList } from "@/components/keuangan/SlottingOmsetList"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function SlottingOmsetPage() {
  const user = await requirePageRole(["owner", "direktur"])

  const slots = await prisma.revenueSlot.findMany({
    include: { payment: { include: { client: true } } },
    orderBy: { createdAt: "desc" },
    take: 300, // batas aman, sama pola dengan Jurnal Umum/Payment history
  })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Slotting Omset</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Bagi Laba Bersih (Uang Masuk - HPP) tiap pembayaran ke Operasional/Direksi/Bonus/Cadangan HPP lewat Pindah Buku otomatis.
          </p>
        </div>

        <SlottingOmsetList
          rows={slots.map((s) => ({
            id: s.id,
            paymentNumber: s.payment.paymentNumber,
            clientName: s.payment.client.name,
            createdAt: s.createdAt.toISOString(),
            grossAmount: s.grossAmount,
            initialCostAmount: s.initialCostAmount,
            additionalCostAmount: s.additionalCostAmount,
            netAmount: s.netAmount,
            status: s.status as "draft" | "processed" | "skipped",
          }))}
        />
      </div>
    </AppLayout>
  )
}
