import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { DomainSection } from "@/components/pengaturan/MasterDataPanel"

export default async function MonitoringDomainPage() {
  const user = await getCurrentUser("monitoring")
  if (user.role !== "owner" && user.role !== "admin") redirect("/dashboard")

  const [domains, clients] = await Promise.all([
    prisma.domain.findMany({ include: { client: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Domain</h1>
        <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Data domain — sama dengan Pengaturan &rarr; Master Data.</p>
      </div>
      <DomainSection
        rows={domains.map((d) => ({
          ...d,
          lastPaidAt: d.lastPaidAt ? d.lastPaidAt.toISOString() : null,
          expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
        }))}
        clients={clients}
      />
    </div>
  )
}
