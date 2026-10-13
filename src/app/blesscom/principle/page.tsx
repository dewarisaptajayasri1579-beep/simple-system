import { AppLayout } from "@/components/layout/AppLayout"
import { PrinciplePanel, type PrincipleRow } from "@/components/blesscom/PrinciplePanel"
import { Alert } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { isPrincipleBillableForMonth, principleMonthLabel, resolvePrincipleMonth } from "@/lib/principle-billing"

export default async function BlesscomPrinciplePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; bulan?: string }>
}) {
  const user = await getCurrentUser()
  const params = await searchParams
  const monthIso = resolvePrincipleMonth(params.bulan)

  const companies = await prisma.principleCompany.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
  // Default dropdown = perusahaan pertama (Blesscom), biar halaman tidak kosong saat dibuka
  // dari menu tanpa query param.
  const companyId = params.companyId && companies.some((c) => c.id === params.companyId) ? params.companyId : (companies[0]?.id ?? "")

  const principles = companyId
    ? await prisma.principle.findMany({
        where: { companyId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    : []

  const rows: PrincipleRow[] = principles.map((p) => ({
    id: p.id,
    name: p.name,
    appUrl: p.appUrl,
    startedAtIso: p.startedAt?.toISOString() ?? null,
    active: p.active,
    deactivatedAtIso: p.deactivatedAt?.toISOString() ?? null,
    sortOrder: p.sortOrder,
    billableThisMonth: isPrincipleBillableForMonth(p, monthIso),
  }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Principle</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Daftar client dari Blesscom/Blessfull — jumlah yang aktif jadi dasar tagihan bulanan.
          </p>
        </div>

        {companies.length === 0 ? (
          <Alert variant="warning">
            Belum ada perusahaan. Tambahkan dulu di menu <strong>Perusahaan</strong>.
          </Alert>
        ) : (
          <PrinciplePanel
            companies={companies}
            companyId={companyId}
            monthLabel={principleMonthLabel(monthIso)}
            principles={rows}
            canEdit={["owner", "admin", "direktur"].includes(user.role)}
            canDelete={["owner", "direktur"].includes(user.role)}
          />
        )}
      </div>
    </AppLayout>
  )
}
