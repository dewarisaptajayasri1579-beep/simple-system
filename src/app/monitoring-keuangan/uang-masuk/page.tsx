import { prisma } from "@/lib/prisma"
import { Card, CardDescription } from "@/components/ui"
import { Globe, Server as ServerIcon, Wrench, FolderKanban, TrendingUp } from "lucide-react"
import { resolveDomainExpiry, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status"
import { ensureBillingFollowUps, computeSlaStatus, type BillingFollowUpRef } from "@/lib/billing-follow-up"
import { buildRevenueForecast } from "@/lib/revenue-forecast"
import { DomainRekapSection, type DomainRekapRow } from "@/components/monitoring-keuangan/DomainRekapSection"

const BUCKET_WEIGHT: Record<ExpiryBucket, number> = { expired: 0, expiring_this_month: 1, expiring_next_month: 2, safe: 3 }

export default async function UangMasukPage() {
  const [domains, serverCount, maintenanceCount, projectCount] = await Promise.all([
    // doubtfulAt/pendingAt: null — domain yang ditahan Owner sengaja dikeluarkan, sama pola
    // dengan Dashboard utama (lihat src/app/dashboard/page.tsx).
    prisma.domain.findMany({ where: { active: true, doubtfulAt: null, pendingAt: null }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.server.count({ where: { active: true, doubtfulAt: null, pendingAt: null } }),
    prisma.maintenance.count({ where: { active: true } }),
    prisma.project.count({ where: { status: "berjalan" } }),
  ])

  const domainRowsBase = domains.map((d) => {
    const expiry = resolveDomainExpiry(d)
    return {
      id: d.id,
      name: d.name,
      ownerLabel: d.client?.name ?? "Internal 7Smarts",
      clientId: d.clientId,
      price: d.sellPrice,
      dueDate: expiry ? expiry.toISOString() : null,
      bucket: getExpiryBucket(expiry),
    }
  })

  // Siklus SLA (belum ditagih/sudah ditagih/belum bayar) cuma relevan buat domain yang PUNYA
  // Client dan LAGI due (bucket != "safe") — sama syarat dengan Dashboard utama. Domain Internal
  // (tanpa Client) dan domain yang expiry-nya masih jauh otomatis dianggap "Aktif".
  const slaRefs: BillingFollowUpRef[] = domainRowsBase
    .filter((r) => r.clientId && r.bucket !== "safe")
    .map((r) => ({ refType: "domain" as const, refId: r.id }))
  await ensureBillingFollowUps(prisma, slaRefs)
  const activeFollowUps =
    slaRefs.length > 0 ? await prisma.billingFollowUp.findMany({ where: { paidRecordedAt: null, OR: slaRefs.map((r) => ({ refType: r.refType, refId: r.refId })) } }) : []
  const followUpByRef = new Map(activeFollowUps.map((f) => [`domain:${f.refId}`, f]))

  const domainRows: DomainRekapRow[] = domainRowsBase
    .map((r) => {
      const record = r.clientId ? followUpByRef.get(`domain:${r.id}`) : undefined
      const sla = record ? computeSlaStatus(record) : null
      const status: DomainRekapRow["status"] = !sla
        ? "aktif"
        : sla.stage === "belum_ditagih" || sla.stage === "tagih_lagi"
          ? "belum_ditagih"
          : sla.stage === "menunggu_jawaban"
            ? "sudah_ditagih"
            : "belum_bayar"
      return {
        id: r.id,
        name: r.name,
        ownerLabel: r.ownerLabel,
        price: r.price,
        dueDate: r.dueDate,
        status,
        sortWeight: BUCKET_WEIGHT[r.bucket],
      }
    })
    .sort((a, b) => a.sortWeight - b.sortWeight || (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))

  const totalDomain = domainRows.length
  const belumTagih = domainRows.filter((r) => r.status === "belum_ditagih").length
  const sudahDitagih = domainRows.filter((r) => r.status === "sudah_ditagih" || r.status === "belum_bayar").length
  const belumBayar = domainRows.filter((r) => r.status === "belum_bayar").length

  // Distribusi jatuh tempo domain 12 bulan KE DEPAN (bukan histori — data histori bulanan tidak
  // disimpan) — pakai fungsi forecast yang sama dengan section Prediksi Pendapatan di Dashboard,
  // cuma domain saja & tanpa filter Internal (biar kelihatan semua siklus renewal termasuk yang
  // harganya 0), supaya jumlah "muncul di grafik" konsisten dengan Daftar Domain di bawahnya.
  const forecastMonths = buildRevenueForecast({
    domains: domainRowsBase.filter((d) => d.clientId).map((d) => ({ name: d.name, price: d.price ?? 0, expiry: d.dueDate ? new Date(d.dueDate) : null })),
    servers: [],
    maintenances: [],
    projectSchedules: [],
  })
  const domainTrend = forecastMonths.map((m) => ({ label: m.label, count: m.items.length }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="feature" padding="md">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-sky-500/15 text-sky-700 flex items-center justify-center flex-shrink-0"><Globe className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Domain</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{totalDomain}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Total Domain</p>
        </Card>
        <Card variant="feature" padding="md" className="opacity-60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-violet-500/15 text-violet-700 flex items-center justify-center flex-shrink-0"><ServerIcon className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Server</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{serverCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Segera hadir</p>
        </Card>
        <Card variant="feature" padding="md" className="opacity-60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-fuchsia-500/15 text-fuchsia-700 flex items-center justify-center flex-shrink-0"><Wrench className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Maintenance</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{maintenanceCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Segera hadir</p>
        </Card>
        <Card variant="feature" padding="md" className="opacity-60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center flex-shrink-0"><FolderKanban className="w-5 h-5" /></span>
            <CardDescription className="font-bold text-slate-700">Proyek</CardDescription>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-3">{projectCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Segera hadir</p>
        </Card>
      </div>

      <Card variant="feature" padding="md" className="opacity-70">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-5 h-5" /></span>
          <div>
            <p className="text-sm font-bold text-slate-700">Prediksi Pendapatan</p>
            <p className="text-[11px] text-slate-500 font-semibold">Gabungan Domain/Server/Maintenance/Proyek — segera hadir, lihat sementara di Dashboard.</p>
          </div>
        </div>
      </Card>

      <DomainRekapSection rows={domainRows} total={totalDomain} belumTagih={belumTagih} sudahDitagih={sudahDitagih} belumBayar={belumBayar} trend={domainTrend} />
    </div>
  )
}
