import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card } from "@/components/ui"
import { TransactionPostingBar } from "@/components/keuangan/TransactionPostingBar"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { ArrowLeft } from "lucide-react"
import type { JournalSource } from "@/components/akuntansi/JournalPreviewModal"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

const REF_LABEL: Record<string, string> = {
  domain: "Bayar Domain",
  server: "Bayar Server",
  maintenance: "Bayar Maintenance",
  recurring_bill: "Bayar Biaya Berkala",
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true, category: true, invoicePayment: { select: { id: true } } },
  })
  if (!transaction) notFound()

  const backHref = transaction.type === "income" ? "/keuangan/kas-masuk" : "/keuangan/kas-keluar"

  const source: JournalSource = transaction.journalEntryId
    ? { entryId: transaction.journalEntryId }
    : transaction.refType && transaction.refId
      ? { sourceType: transaction.refType, sourceId: transaction.refId }
      : { sourceType: "transaction", sourceId: transaction.id }

  // Kalau bagian dari 1 Payment (baris Pelunasan invoice ATAU biaya domain/server/maintenance
  // yang dikaitkan), semua aksi kelola (posting/hapus/batalkan) cuma boleh lewat menu
  // Pembayaran — lihat guard yang sama di POST/DELETE /api/transactions/[id].
  const managedByPaymentId = transaction.paymentId

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-2xl mx-auto">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>

        <TransactionPostingBar
          transactionId={transaction.id}
          postStatus={transaction.postStatus as "draft" | "posted" | "voided"}
          sources={[source]}
          managedByPaymentId={managedByPaymentId}
          isOwner={user.role === "owner"}
        />

        <Card variant="panel" padding="lg">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900">{transaction.type === "income" ? "Kas Masuk" : "Kas Keluar"}</h1>
              {transaction.refType && <p className="text-xs text-slate-500 font-semibold mt-0.5">{REF_LABEL[transaction.refType] ?? transaction.refType}</p>}
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-slate-900">{transaction.transactionNumber ?? "-"}</p>
              <p className="text-xs text-slate-500 font-semibold">{formatDate(transaction.occurredAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Keterangan</p>
              <p className="font-bold text-slate-900 mt-1">{transaction.description || "-"}</p>
              {transaction.category && <p className="text-sm text-slate-600">{transaction.category.name}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold text-slate-500 uppercase">Akun</p>
              <p className="font-semibold text-slate-800">{transaction.account.name}</p>
            </div>
          </div>

          <div className="flex justify-end mt-6 pt-6 border-t border-slate-200/60">
            <div className="w-full sm:w-72 space-y-1.5 text-sm">
              <div className="flex justify-between text-lg font-black text-slate-900">
                <span>Jumlah</span>
                <span>{formatRupiah(transaction.grossAmount)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
