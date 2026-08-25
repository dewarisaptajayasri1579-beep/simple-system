import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription, TableContainer, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui"
import { BukuBesarFilter } from "@/components/akuntansi/BukuBesarFilter"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { accountMovement } from "@/lib/accounting/coa-balance"
import { monthPeriod } from "@/lib/accounting/month-period"
import { jakartaTodayDateIso } from "@/lib/datetime"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}
function formatDate(d: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d)
}

export default async function BukuBesarPage({ searchParams }: { searchParams: Promise<{ accountId?: string; month?: string }> }) {
  // Admin dibatasi (lihat Pengaturan > Akses COA per Role) — Owner/Direktur selalu lihat semua
  // akun tanpa filter, sama seperti sebelumnya.
  const user = await requirePageRole(["owner", "direktur", "admin"])
  const params = await searchParams
  const month = params.month || jakartaTodayDateIso().slice(0, 7)
  const { from, to } = monthPeriod(month)

  const allAccounts = await prisma.chartOfAccount.findMany({ orderBy: { code: "asc" } })
  let accounts = allAccounts
  if (user.role === "admin") {
    const allowed = await prisma.roleCoaAccess.findMany({ where: { role: "admin" }, select: { coaAccountId: true } })
    const allowedIds = new Set(allowed.map((a) => a.coaAccountId))
    accounts = allAccounts.filter((a) => allowedIds.has(a.id))
  }
  const accountId = params.accountId || accounts[0]?.id || ""
  const account = accounts.find((a) => a.id === accountId) ?? null

  const lines = account
    ? await prisma.journalLine.findMany({
        where: { accountId, journalEntry: { is: { postStatus: "posted" } } },
        include: { journalEntry: true },
        orderBy: [{ journalEntry: { date: "asc" } }, { journalEntry: { createdAt: "asc" } }],
      })
    : []

  const movement = (debit: number, credit: number) => accountMovement(account?.type ?? "asset", debit, credit)

  const saldoAwal = lines.filter((l) => l.journalEntry.date < from).reduce((s, l) => s + movement(l.debit, l.credit), 0)

  const periodLines = lines.filter((l) => l.journalEntry.date >= from && l.journalEntry.date <= to)

  let running = saldoAwal
  const rows = periodLines.map((l) => {
    running += movement(l.debit, l.credit)
    const isDebit = l.debit > 0
    return {
      id: l.id,
      journalEntryId: l.journalEntry.id,
      date: l.journalEntry.date,
      entryNumber: l.journalEntry.entryNumber,
      description: l.memo || l.journalEntry.description,
      dk: isDebit ? "D" : "K",
      nominal: isDebit ? l.debit : l.credit,
      saldo: running,
    }
  })

  const totalDebit = periodLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = periodLines.reduce((s, l) => s + l.credit, 0)
  const saldoAkhir = running

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Buku Besar</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Mutasi debit/kredit per akun — saldo awal, mutasi bulan berjalan, saldo akhir.
          </p>
        </div>

        <BukuBesarFilter accountId={accountId} accountOptions={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} month={month} />

        {!account ? (
          <Card variant="feature" padding="lg">
            <p className="text-sm text-slate-500">
              {user.role === "admin" && accounts.length === 0
                ? "Belum ada akun COA yang diizinkan untuk role Admin — hubungi Owner (Pengaturan > Akses COA per Role)."
                : "Belum ada akun COA."}
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card variant="feature" padding="md">
                <CardDescription>Saldo Awal</CardDescription>
                <p className="text-lg font-black text-slate-900 mt-1">{formatRupiah(saldoAwal)}</p>
              </Card>
              <Card variant="feature" padding="md">
                <CardDescription>Debet</CardDescription>
                <p className="text-lg font-black text-slate-900 mt-1">{formatRupiah(totalDebit)}</p>
              </Card>
              <Card variant="feature" padding="md">
                <CardDescription>Kredit</CardDescription>
                <p className="text-lg font-black text-slate-900 mt-1">{formatRupiah(totalCredit)}</p>
              </Card>
              <Card variant="feature" padding="md">
                <CardDescription>Saldo Akhir</CardDescription>
                <p className="text-lg font-black text-slate-900 mt-1">{formatRupiah(saldoAkhir)}</p>
              </Card>
            </div>

            <Card variant="panel" padding="none">
              <CardHeader className="p-5 sm:p-6 mb-0">
                <CardTitle>
                  {account.code} — {account.name}
                </CardTitle>
                <CardDescription>
                  {month} · {rows.length} mutasi
                </CardDescription>
              </CardHeader>
              <TableContainer className="border-0 rounded-none shadow-none">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No. Bukti</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead>D/K</TableHead>
                      <TableHead>Nominal</TableHead>
                      <TableHead>Saldo Akhir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-semibold text-slate-500">
                        Saldo Awal
                      </TableCell>
                      <TableCell className="font-bold">{formatRupiah(saldoAwal)}</TableCell>
                    </TableRow>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{formatDate(r.date)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/akuntansi/jurnal?entryId=${r.journalEntryId}`} className="text-[#0544cc] hover:underline">
                            {r.entryNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{r.description}</TableCell>
                        <TableCell className="font-bold">{r.dk}</TableCell>
                        <TableCell className="font-semibold">{formatRupiah(r.nominal)}</TableCell>
                        <TableCell className="font-semibold">{formatRupiah(r.saldo)}</TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                          Tidak ada mutasi di bulan ini.
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-black text-slate-700">
                        Saldo Akhir
                      </TableCell>
                      <TableCell className="font-black">{formatRupiah(saldoAkhir)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  )
}
