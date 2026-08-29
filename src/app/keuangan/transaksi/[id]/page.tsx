import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card } from "@/components/ui"
import { TransactionPostingBar } from "@/components/keuangan/TransactionPostingBar"
import { TransactionDetailFields } from "@/components/keuangan/TransactionDetailFields"
import { AuditTrail } from "@/components/shared/AuditTrail"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveUserNames } from "@/lib/user-names"
import { ArrowLeft } from "lucide-react"
import type { JournalSource } from "@/components/akuntansi/JournalPreviewModal"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

const REF_LABEL: Record<string, string> = {
  domain: "Bayar Domain",
  server: "Bayar Server",
  maintenance: "Bayar Maintenance",
  recurring_bill: "Bayar Biaya Berkala",
  kasbon: "Kasbon",
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true, category: true, invoicePayment: { select: { id: true } } },
  })
  if (!transaction) notFound()

  const userNames = await resolveUserNames([transaction.createdById, transaction.postedById, transaction.voidedById])

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

  // Sama syaratnya dengan PATCH /api/transactions/[id]: draft pengeluaran manual ATAU baris
  // Bayar Domain/Server/Maintenance/Biaya Berkala (bukan bagian dari Payment) boleh edit inline
  // di sini — sisanya (Kas Masuk manual, atau bagian dari Payment) tetap lewat Posting/Hapus.
  const EDITABLE_REF_TYPES = new Set(["domain", "server", "maintenance", "recurring_bill", "kasbon"])
  const editable =
    transaction.postStatus === "draft" &&
    transaction.type === "expense" &&
    (!transaction.refType || EDITABLE_REF_TYPES.has(transaction.refType)) &&
    !managedByPaymentId
  // Kategori baris ref-based ngikut item terkait (Domain/Server/Maintenance/kategori Biaya
  // Berkala), bukan pilihan bebas — jadi selector Kategori dikunci buat kasus itu.
  const categoryLocked = Boolean(transaction.refType)
  const [accounts, categories] = editable
    ? await Promise.all([
        prisma.account.findMany({ orderBy: { name: "asc" } }),
        categoryLocked ? Promise.resolve([]) : prisma.category.findMany({ where: { kind: "expense" }, orderBy: { name: "asc" } }),
      ])
    : [[], []]

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

          <TransactionDetailFields
            transactionId={transaction.id}
            editable={editable}
            categoryLocked={categoryLocked}
            description={transaction.description ?? ""}
            accountId={transaction.accountId}
            accountName={transaction.account.name}
            categoryId={transaction.categoryId ?? ""}
            categoryName={transaction.category?.name ?? ""}
            grossAmount={transaction.grossAmount}
            accountOptions={accounts.map((a) => ({ value: a.id, label: a.name }))}
            categoryOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
          />

          <div className="mt-4 pt-4 border-t border-slate-200/60">
            <AuditTrail
              createdByName={transaction.createdById ? (userNames.get(transaction.createdById) ?? null) : null}
              postedByName={transaction.postedById ? (userNames.get(transaction.postedById) ?? null) : null}
              postedAt={transaction.postedAt ? transaction.postedAt.toISOString() : null}
              voidedByName={transaction.voidedById ? (userNames.get(transaction.voidedById) ?? null) : null}
              voidedAt={transaction.voidedAt ? transaction.voidedAt.toISOString() : null}
              voidReason={transaction.voidReason}
            />
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
