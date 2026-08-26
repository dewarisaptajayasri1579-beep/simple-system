import { AppLayout } from "@/components/layout/AppLayout"
import { JurnalList } from "@/components/akuntansi/JurnalList"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveUserNames } from "@/lib/user-names"

export default async function JurnalPage() {
  const user = await requirePageRole(["owner", "direktur"])

  const [entries, coaAccounts] = await Promise.all([
    // 300 entri terbaru — bukan seluruh histori. JournalEntry salah satu tabel paling cepat
    // nambah (1 dibuat tiap invoice/pembayaran/transaksi diposting), tanpa batas ini query-nya
    // makin berat tiap bulan padahal yang benar-benar dilihat staf ya yang terbaru.
    prisma.journalEntry.findMany({
      include: { lines: { include: { account: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
    // Cuma akun non-parent (leaf) & aktif yang boleh dipilih di baris jurnal — akun parent
    // (mis. "1-0000 Aset") cuma wadah pengelompokan, tidak boleh nampung mutasi langsung.
    prisma.chartOfAccount.findMany({ where: { isParent: false, isActive: true }, orderBy: { code: "asc" } }),
  ])
  const userNames = await resolveUserNames(entries.map((e) => e.createdBy))

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
            postStatus: e.postStatus as "draft" | "posted" | "voided",
            createdByName: e.createdBy ? (userNames.get(e.createdBy) ?? null) : null,
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
          currentUserName={user.name}
        />
      </div>
    </AppLayout>
  )
}
