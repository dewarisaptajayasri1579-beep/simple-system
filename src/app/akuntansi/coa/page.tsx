import { AppLayout } from "@/components/layout/AppLayout"
import { CoaList } from "@/components/akuntansi/CoaList"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { accountMovement } from "@/lib/accounting/coa-balance"
import { monthPeriod } from "@/lib/accounting/month-period"
import { jakartaTodayDateIso } from "@/lib/datetime"

export default async function CoaPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePageRole(["owner", "direktur"])
  const params = await searchParams
  const month = params.month || jakartaTodayDateIso().slice(0, 7)
  const { to: monthEnd } = monthPeriod(month)

  const accounts = await prisma.chartOfAccount.findMany({
    include: { journalLines: { include: { journalEntry: true } } },
    orderBy: { code: "asc" },
  })

  // Saldo "sendiri" dari jurnal yang nempel langsung di akun itu (sampai akhir bulan terpilih).
  // WAJIB filter postStatus "posted" — draft belum berlaku, voided sudah dibatalkan — sama
  // seperti Buku Besar/account-balance.ts, kalau tidak saldo ikut kehitung dobel/salah tiap kali
  // ada draft atau pembayaran yang dibatalkan & diulang.
  const ownBalance = new Map<string, number>()
  for (const a of accounts) {
    const relevant = a.journalLines.filter((l) => l.journalEntry.date <= monthEnd && l.journalEntry.postStatus === "posted")
    const debit = relevant.reduce((s, l) => s + l.debit, 0)
    const credit = relevant.reduce((s, l) => s + l.credit, 0)
    ownBalance.set(a.id, accountMovement(a.type, debit, credit))
  }

  // Akun induk (parent) tampilkan subtotal dari seluruh anaknya, bukan cuma saldo sendiri
  // (biasanya memang 0 karena jurnal selalu diposting ke akun paling detail/leaf).
  const childrenOf = new Map<string | null, string[]>()
  for (const a of accounts) {
    const key = a.parentId
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(a.id)
  }
  const rollupCache = new Map<string, number>()
  const rollup = (id: string): number => {
    if (rollupCache.has(id)) return rollupCache.get(id)!
    const own = ownBalance.get(id) ?? 0
    const childSum = (childrenOf.get(id) ?? []).reduce((s, childId) => s + rollup(childId), 0)
    const total = own + childSum
    rollupCache.set(id, total)
    return total
  }
  for (const a of accounts) rollup(a.id)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Chart of Accounts</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Daftar akun untuk pembukuan akrual. Dipakai otomatis oleh Jurnal Umum.
          </p>
        </div>

        <CoaList
          rows={accounts.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            type: a.type,
            isActive: a.isActive,
            isParent: a.isParent,
            parentId: a.parentId,
            parentName: null,
            saldoAkhir: rollupCache.get(a.id) ?? 0,
            hasHistory: a.journalLines.length > 0,
          }))}
          isOwner={user.role === "owner"}
          month={month}
        />
      </div>
    </AppLayout>
  )
}
