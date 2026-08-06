import { AppLayout } from "@/components/layout/AppLayout"
import { JurnalList } from "@/components/akuntansi/JurnalList"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function JurnalPage() {
  const user = await requirePageRole(["owner", "direktur"])

  const [entries, coaAccounts] = await Promise.all([
    prisma.journalEntry.findMany({
      include: { lines: { include: { account: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.chartOfAccount.findMany({ orderBy: { code: "asc" } }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Jurnal Umum</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Semua jurnal debit/kredit — otomatis dari invoice/pembayaran/transaksi, atau manual.
          </p>
        </div>

        <JurnalList
          entries={entries.map((e) => ({
            id: e.id,
            entryNumber: e.entryNumber,
            date: e.date.toISOString(),
            description: e.description,
            sourceType: e.sourceType,
            lines: e.lines.map((l) => ({
              id: l.id,
              accountCode: l.account.code,
              accountName: l.account.name,
              debit: l.debit,
              credit: l.credit,
              memo: l.memo,
            })),
          }))}
          coaAccounts={coaAccounts.map((a) => ({ id: a.id, code: a.code, name: a.name }))}
          isOwner={user.role === "owner"}
        />
      </div>
    </AppLayout>
  )
}
