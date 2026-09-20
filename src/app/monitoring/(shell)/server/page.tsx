import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { ServerSection } from "@/components/pengaturan/MasterDataPanel"

export default async function MonitoringServerPage() {
  const user = await getCurrentUser("monitoring")
  if (user.role !== "owner" && user.role !== "admin" && user.role !== "sysadmin") redirect("/dashboard")
  // Sys Administrator boleh LIHAT daftar server, tapi data finansialnya (Harga, Terakhir Bayar,
  // Tandai Lunas) bukan urusan role ini — disembunyikan di ServerSection lewat restrictedView.
  const restrictedView = user.role === "sysadmin"

  const [servers, vendors, cloudTypes, clients] = await Promise.all([
    prisma.server.findMany({ include: { vendor: true, cloudType: true, period: true, client: true }, orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.cloudType.findMany({ orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Server</h1>
        <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Data server — sama dengan Pengaturan &rarr; Master Data.</p>
      </div>
      <ServerSection
        rows={servers.map((s) => ({
          ...s,
          lastPaidAt: s.lastPaidAt ? s.lastPaidAt.toISOString() : null,
          expiryDate: s.expiryDate ? s.expiryDate.toISOString() : null,
        }))}
        vendors={vendors}
        cloudTypes={cloudTypes}
        clients={clients}
        restrictedView={restrictedView}
      />
    </div>
  )
}
