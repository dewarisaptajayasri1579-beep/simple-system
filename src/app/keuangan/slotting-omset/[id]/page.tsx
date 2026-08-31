import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { SlottingOmsetDetail } from "@/components/keuangan/SlottingOmsetDetail"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function SlottingOmsetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole(["owner", "direktur"])
  const { id } = await params

  const [slot, settings] = await Promise.all([
    prisma.revenueSlot.findUnique({
      where: { id },
      include: {
        payment: { include: { client: true, account: true } },
        costLines: { orderBy: { createdAt: "asc" } },
        transfers: { include: { destinationAccount: true } },
      },
    }),
    prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
  ])
  if (!slot) notFound()

  const [operasionalAccount, direksiAccount, bonusAccount, hppReserveAccount, labaDitahanAccount] = await Promise.all([
    settings.slottingOperasionalAccountId ? prisma.account.findUnique({ where: { id: settings.slottingOperasionalAccountId } }) : null,
    settings.slottingDireksiAccountId ? prisma.account.findUnique({ where: { id: settings.slottingDireksiAccountId } }) : null,
    settings.slottingBonusAccountId ? prisma.account.findUnique({ where: { id: settings.slottingBonusAccountId } }) : null,
    settings.slottingHppReserveAccountId ? prisma.account.findUnique({ where: { id: settings.slottingHppReserveAccountId } }) : null,
    settings.slottingLabaDitahanAccountId ? prisma.account.findUnique({ where: { id: settings.slottingLabaDitahanAccountId } }) : null,
  ])

  // Default centang checkbox "Biaya Admin" per rekening tujuan — nyala kalau bank sumber &
  // tujuan beda (transfer antar bank beneran), staf tetap bisa override manual sebelum Proses.
  const sourceAccount = slot.payment.account
  const defaultFeeApplies = (destAccount: { type: string; bankName: string | null } | null) =>
    !!destAccount && sourceAccount.type === "bank" && destAccount.type === "bank" && sourceAccount.bankName !== destAccount.bankName

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <SlottingOmsetDetail
          isOwner={user.role === "owner"}
          slot={{
            id: slot.id,
            status: slot.status as "draft" | "processed" | "skipped",
            grossAmount: slot.grossAmount,
            initialCostAmount: slot.initialCostAmount,
            additionalCostAmount: slot.additionalCostAmount,
            netAmount: slot.netAmount,
            operasionalAmount: slot.operasionalAmount,
            direksiAmount: slot.direksiAmount,
            bonusAmount: slot.bonusAmount,
            hppReserveAmount: slot.hppReserveAmount,
            labaDitahanAmount: slot.labaDitahanAmount,
            transferFeeTotal: slot.transferFeeTotal,
            payment: {
              id: slot.payment.id,
              paymentNumber: slot.payment.paymentNumber,
              clientName: slot.payment.client.name,
              accountName: slot.payment.account.name,
            },
            costLines: slot.costLines.map((l) => ({ id: l.id, description: l.description, amount: l.amount })),
            transfers: slot.transfers.map((t) => ({
              id: t.id,
              destinationAccountName: t.destinationAccount.name,
              amount: t.amount,
              journalEntryId: t.journalEntryId,
            })),
          }}
          settingsPreview={{
            operasionalPct: settings.slottingOperasionalPct,
            direksiPct: settings.slottingDireksiPct,
            bonusPct: settings.slottingBonusPct,
            hppReservePct: settings.slottingHppReservePct,
            labaDitahanPct: settings.slottingLabaDitahanPct,
            operasionalAccountName: operasionalAccount?.name ?? null,
            direksiAccountName: direksiAccount?.name ?? null,
            bonusAccountName: bonusAccount?.name ?? null,
            hppReserveAccountName: hppReserveAccount?.name ?? null,
            labaDitahanAccountName: labaDitahanAccount?.name ?? null,
            transferFee: settings.slottingTransferFee,
            defaultFeeApplies: {
              Operasional: defaultFeeApplies(operasionalAccount),
              Direksi: defaultFeeApplies(direksiAccount),
              Bonus: defaultFeeApplies(bonusAccount),
              "Cadangan Modal/HPP": defaultFeeApplies(hppReserveAccount),
              "Laba Ditahan/Dana Darurat": defaultFeeApplies(labaDitahanAccount),
            },
          }}
        />
      </div>
    </AppLayout>
  )
}
