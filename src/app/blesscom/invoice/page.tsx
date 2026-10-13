import Link from "next/link"

import { AppLayout } from "@/components/layout/AppLayout"
import { BuatInvoicePrincipleButton } from "@/components/blesscom/BuatInvoicePrincipleButton"
import { PerusahaanSelect } from "@/components/blesscom/PerusahaanSelect"
import { MonthFilter } from "@/components/laporan/MonthFilter"
import {
  Alert,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  StatusBadge,
  type StatusBadgeType,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import {
  computePrincipleCharge,
  isPrincipleBillableForMonth,
  principleMonthLabel,
  resolvePrincipleMonth,
  sumPrincipleCharge,
} from "@/lib/principle-billing"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

/** Select perusahaan versi server-component — cuma navigasi, jadi tidak perlu komponen client
 *  sendiri; Select-nya sendiri sudah client component. */
export default async function BlesscomInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; bulan?: string }>
}) {
  const user = await getCurrentUser()
  const params = await searchParams
  const monthIso = resolvePrincipleMonth(params.bulan)
  const monthLabel = principleMonthLabel(monthIso)

  const companies = await prisma.principleCompany.findMany({
    orderBy: { name: "asc" },
    include: {
      client: { select: { id: true, name: true } },
      priceTiers: { orderBy: { fromCount: "asc" } },
      principles: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
  })
  const company = companies.find((c) => c.id === params.companyId) ?? companies[0] ?? null

  const billable = company ? company.principles.filter((p) => isPrincipleBillableForMonth(p, monthIso)) : []
  const lines = company ? computePrincipleCharge(billable.length, company.priceTiers) : []
  const total = sumPrincipleCharge(lines)

  // Invoice principle yang sudah pernah dibuat — dipakai buat memperingatkan dobel tagih bulan
  // yang sama, dan sebagai riwayat di bawah.
  const history = company
    ? await prisma.principleInvoice.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true, postStatus: true, issuedAt: true } },
          _count: { select: { items: true } },
        },
      })
    : []
  const existingThisMonth = history.find((h) => h.periodMonth === monthIso)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Invoice Blesscom</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Invoice Over Principle — nominalnya dihitung dari principle aktif, lampirannya ikut tercetak.
            </p>
          </div>
          <MonthFilter monthIso={monthIso} />
        </div>

        {companies.length === 0 ? (
          <Alert variant="warning">
            Belum ada perusahaan. Tambahkan dulu di menu <strong>Perusahaan</strong>.
          </Alert>
        ) : (
          <>
            <div className="max-w-xs">
              <PerusahaanSelect companies={companies.map((c) => ({ id: c.id, name: c.name }))} value={company?.id ?? ""} monthIso={monthIso} />
            </div>

            {company && (
              <>
                {!company.clientId && (
                  <Alert variant="error">
                    {company.name} belum ditautkan ke Client penagihan — buka menu <strong>Perusahaan</strong> dan pilih
                    client-nya dulu sebelum bisa membuat invoice.
                  </Alert>
                )}
                {company.priceTiers.length === 0 && (
                  <Alert variant="error">
                    Tingkatan harga {company.name} belum diatur — buka menu <strong>Perusahaan</strong> → Atur Harga.
                  </Alert>
                )}

                <Card variant="panel" padding="lg">
                  <CardHeader>
                    <CardTitle>Hitungan {monthLabel}</CardTitle>
                    <CardDescription>
                      {billable.length} principle ikut ditagih dari {company.principles.length} principle terdaftar.
                    </CardDescription>
                  </CardHeader>

                  {lines.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Belum ada yang bisa ditagih bulan ini (tidak ada principle aktif atau tingkatan harga belum diatur).
                    </p>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden mb-4">
                      {lines.map((l) => (
                        <div
                          key={l.label}
                          className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{l.label}</p>
                            <p className="text-xs text-slate-500">
                              {l.qty} principle × {formatRupiah(l.unitPrice)}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-slate-900">{formatRupiah(l.total)}</p>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">
                        <p className="text-sm font-black text-slate-700">Total Tagihan</p>
                        <p className="text-lg font-black text-emerald-700">{formatRupiah(total)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {["owner", "admin", "direktur"].includes(user.role) && company.clientId && (
                      <BuatInvoicePrincipleButton
                        companyId={company.id}
                        companyName={company.name}
                        clientId={company.clientId}
                        monthIso={monthIso}
                        monthLabel={monthLabel}
                        lines={lines}
                        principleCount={billable.length}
                        existingInvoiceNumber={existingThisMonth?.invoice.invoiceNumber ?? null}
                      />
                    )}
                    <Link href={`/blesscom/principle?companyId=${company.id}`} className="text-sm font-bold text-blue-700 hover:underline">
                      Kelola daftar principle
                    </Link>
                  </div>
                </Card>

                <Card variant="panel" padding="none">
                  <CardHeader className="p-5 sm:p-6 mb-0">
                    <CardTitle>Riwayat Invoice Over Principle</CardTitle>
                    <CardDescription>{history.length} invoice · nomornya sama dengan di menu Invoice.</CardDescription>
                  </CardHeader>
                  <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No Invoice</TableHead>
                          <TableHead>Periode</TableHead>
                          <TableHead>Principle</TableHead>
                          <TableHead>Nominal</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                              Belum ada invoice Over Principle.
                            </TableCell>
                          </TableRow>
                        )}
                        {history.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="font-semibold">
                              <Link href={`/penjualan/${h.invoice.id}`} className="text-blue-700 hover:underline">
                                {h.invoice.invoiceNumber}
                              </Link>
                            </TableCell>
                            <TableCell>{principleMonthLabel(h.periodMonth)}</TableCell>
                            <TableCell>{h.principleCount}</TableCell>
                            <TableCell className="font-bold">{formatRupiah(h.invoice.totalAmount)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <StatusBadge type={h.invoice.status as StatusBadgeType} size="sm" />
                                <StatusBadge type={h.invoice.postStatus as StatusBadgeType} size="sm" />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
