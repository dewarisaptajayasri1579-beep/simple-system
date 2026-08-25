import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card } from "@/components/ui"
import { AccountTransferPostingBar } from "@/components/keuangan/AccountTransferPostingBar"
import { AccountTransferDetailFields } from "@/components/keuangan/AccountTransferDetailFields"
import { AuditTrail } from "@/components/shared/AuditTrail"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveUserNames } from "@/lib/user-names"
import { ArrowLeft } from "lucide-react"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

export default async function AccountTransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole(["owner", "direktur"])
  const { id } = await params

  const transfer = await prisma.accountTransfer.findUnique({
    where: { id },
    include: { sourceAccount: true, destinationAccount: true },
  })
  if (!transfer) notFound()

  const userNames = await resolveUserNames([transfer.createdById, transfer.postedById, transfer.voidedById])

  const editable = transfer.postStatus === "draft"
  const accounts = editable ? await prisma.account.findMany({ orderBy: { name: "asc" } }) : []

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-2xl mx-auto">
        <Link href="/keuangan/pindah-buku" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>

        <AccountTransferPostingBar
          transferId={transfer.id}
          postStatus={transfer.postStatus as "draft" | "posted" | "voided"}
          journalEntryId={transfer.journalEntryId}
          isOwner={user.role === "owner"}
        />

        <Card variant="panel" padding="lg">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900">Pindah Buku</h1>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-slate-900">{transfer.transferNumber ?? "-"}</p>
              <p className="text-xs text-slate-500 font-semibold">{formatDate(transfer.occurredAt)}</p>
            </div>
          </div>

          <AccountTransferDetailFields
            transferId={transfer.id}
            editable={editable}
            description={transfer.description ?? ""}
            sourceAccountId={transfer.sourceAccountId}
            sourceAccountName={transfer.sourceAccount.name}
            destinationAccountId={transfer.destinationAccountId}
            destinationAccountName={transfer.destinationAccount.name}
            amount={transfer.amount}
            accountOptions={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />

          <div className="mt-4 pt-4 border-t border-slate-200/60">
            <AuditTrail
              createdByName={transfer.createdById ? (userNames.get(transfer.createdById) ?? null) : null}
              postedByName={transfer.postedById ? (userNames.get(transfer.postedById) ?? null) : null}
              postedAt={transfer.postedAt ? transfer.postedAt.toISOString() : null}
              voidedByName={transfer.voidedById ? (userNames.get(transfer.voidedById) ?? null) : null}
              voidedAt={transfer.voidedAt ? transfer.voidedAt.toISOString() : null}
              voidReason={transfer.voidReason}
            />
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
