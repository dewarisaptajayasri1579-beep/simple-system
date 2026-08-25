import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription, Alert } from "@/components/ui"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { accountMovement } from "@/lib/accounting/coa-balance"
import { COA_CODE } from "@/lib/accounting/coa-seed"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

const BALANCE_EPSILON = 0.5 // toleransi pembulatan rupiah, sama dengan post-journal.ts

export default async function NeracaAkrualPage() {
  const user = await requirePageRole(["owner", "direktur"])

  // Dulu include SEMUA JournalLine posted punya tiap akun (bertahun-tahun) lalu di-reduce di JS
  // buat dapat SUM per akun — makin berat tiap ada jurnal baru. ChartOfAccount sendiri tabel
  // kecil (~50 baris, aman di-findMany polos); yang berat itu journalLines-nya, jadi itu yang
  // diganti groupBy (SUM+COUNT di database, satu baris teragregasi per akun).
  const [accounts, lineGroups] = await Promise.all([
    prisma.chartOfAccount.findMany({ orderBy: { code: "asc" } }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { journalEntry: { is: { postStatus: "posted" } } },
      _sum: { debit: true, credit: true },
      _count: { _all: true },
    }),
  ])
  const lineGroupByAccountId = new Map(lineGroups.map((g) => [g.accountId, g]))

  const balanceOf = (a: (typeof accounts)[number]) => {
    const g = lineGroupByAccountId.get(a.id)
    return accountMovement(a.type, g?._sum.debit ?? 0, g?._sum.credit ?? 0)
  }
  const hasLines = (a: (typeof accounts)[number]) => (lineGroupByAccountId.get(a.id)?._count._all ?? 0) > 0

  const byType = (type: string) => accounts.filter((a) => a.type === type && hasLines(a))

  const asetRows = byType("asset")
  const liabilitasRows = byType("liability")
  const ekuitasRows = byType("equity")
  const pendapatanTotal = byType("revenue").reduce((s, a) => s + balanceOf(a), 0)
  const hppTotal = byType("cogs").reduce((s, a) => s + balanceOf(a), 0)
  const bebanTotal = byType("expense").reduce((s, a) => s + balanceOf(a), 0)
  const labaBerjalan = pendapatanTotal - hppTotal - bebanTotal

  const asetTotal = asetRows.reduce((s, a) => s + balanceOf(a), 0)
  const liabilitasTotal = liabilitasRows.reduce((s, a) => s + balanceOf(a), 0)
  const ekuitasFormalTotal = ekuitasRows.reduce((s, a) => s + balanceOf(a), 0)
  const ekuitasTotal = ekuitasFormalTotal + labaBerjalan

  const hasAnyJournal = lineGroups.length > 0
  const hutangVendorAccount = accounts.find((a) => a.code === COA_CODE.hutangUsahaVendor)
  const hutangVendorResidual = hutangVendorAccount ? balanceOf(hutangVendorAccount) : 0

  // Aset = Liabilitas + Ekuitas selalu balance secara struktural, KARENA postJournalEntry
  // menolak posting jurnal manapun yang debit != kredit — jadi selisih di sini seharusnya
  // selalu 0. Kalau tidak, itu tanda ada data yang dimanipulasi langsung di database (bypass
  // aplikasi), bukan hal yang bisa terjadi lewat alur normal.
  const selisih = asetTotal - (liabilitasTotal + ekuitasTotal)
  const isBalanced = Math.abs(selisih) <= BALANCE_EPSILON

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Neraca (Akrual)</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Dihitung dari Jurnal Umum (double-entry) — per hari ini. Berjalan berdampingan dengan{" "}
            <a href="/laporan/neraca" className="underline">Neraca cash-basis</a>, bukan pengganti.
          </p>
        </div>

        {hutangVendorResidual > 0.5 && (
          <Alert variant="warning">
            Akun &quot;Hutang Usaha (Vendor)&quot; masih bersaldo {formatRupiah(hutangVendorResidual)} dari jurnal lama (sebelum HPP
            dibebankan langsung ke Kas &amp; Bank). Jalankan{" "}
            <Link href="/akuntansi" className="underline font-semibold">
              Rekalkulasi Jurnal Akrual
            </Link>{" "}
            di halaman Akuntansi untuk memperbaikinya.
          </Alert>
        )}

        {!hasAnyJournal && (
          <Card variant="feature" padding="lg" className="border-amber-300/60">
            <p className="text-sm font-semibold text-amber-700">
              Belum ada jurnal terposting. Buku besar akrual mulai terisi otomatis begitu ada invoice/pembayaran/transaksi baru,
              atau posting jurnal saldo awal manual lewat Akuntansi &gt; Jurnal Umum.
            </p>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card variant="panel" padding="lg">
            <CardHeader>
              <CardTitle>Aset</CardTitle>
            </CardHeader>
            <div className="space-y-2 text-sm">
              {asetRows.map((a) => (
                <div key={a.id} className="flex justify-between">
                  <span className="text-slate-600">{a.name}</span>
                  <span className="font-semibold">{formatRupiah(balanceOf(a))}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-black pt-2 border-t border-slate-200/60">
                <span>Total Aset</span>
                <span>{formatRupiah(asetTotal)}</span>
              </div>
            </div>
          </Card>

          <Card variant="panel" padding="lg">
            <CardHeader>
              <CardTitle>Liabilitas</CardTitle>
            </CardHeader>
            <div className="space-y-2 text-sm">
              {liabilitasRows.length === 0 && <p className="text-slate-400">Belum ada.</p>}
              {liabilitasRows.map((a) => (
                <div key={a.id} className="flex justify-between">
                  <span className="text-slate-600">{a.name}</span>
                  <span className="font-semibold">{formatRupiah(balanceOf(a))}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-black pt-2 border-t border-slate-200/60">
                <span>Total Liabilitas</span>
                <span>{formatRupiah(liabilitasTotal)}</span>
              </div>
            </div>
          </Card>
        </div>

        <Card variant="panel" padding="lg">
          <CardHeader>
            <CardTitle>Ekuitas</CardTitle>
          </CardHeader>
          <div className="space-y-2 text-sm">
            {ekuitasRows.map((a) => (
              <div key={a.id} className="flex justify-between">
                <span className="text-slate-600">{a.name}</span>
                <span className="font-semibold">{formatRupiah(balanceOf(a))}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-slate-600">Laba Berjalan (belum ditutup)</span>
              <span className="font-semibold">{formatRupiah(labaBerjalan)}</span>
            </div>
            <div className="flex justify-between text-base font-black pt-2 border-t border-slate-200/60">
              <span>Total Ekuitas</span>
              <span>{formatRupiah(ekuitasTotal)}</span>
            </div>
          </div>
        </Card>

        <Card variant="feature" padding="lg" className={isBalanced ? "border-emerald-300/60" : "border-rose-400"}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardDescription>Aset = Liabilitas + Ekuitas</CardDescription>
              <p className="text-lg font-black text-slate-900">
                {formatRupiah(asetTotal)} = {formatRupiah(liabilitasTotal + ekuitasTotal)}
              </p>
            </div>
            {isBalanced ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black text-emerald-700 bg-emerald-500/10 border border-emerald-500/30">
                ✓ Balance
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black text-rose-700 bg-rose-500/10 border border-rose-500/30">
                ⚠ TIDAK BALANCE — selisih {formatRupiah(selisih)}
              </span>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
