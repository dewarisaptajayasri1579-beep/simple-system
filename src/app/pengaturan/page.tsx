import Link from "next/link"

import { AppLayout } from "@/components/layout/AppLayout"
import { PengaturanPanel } from "@/components/pengaturan/PengaturanPanel"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function PengaturanPage() {
  // Admin cuma boleh sampai sini buat tab Master Data (lihat filter tab di PengaturanPanel) —
  // data lain (Umum/User/Backup/Akses COA) tetap ikut di-fetch, sengaja tidak dipersempit per
  // role di sini karena query-nya murah dan PengaturanPanel yang menyembunyikan tab-nya.
  const user = await requirePageRole(["owner", "admin"])
  const isOwner = user.role === "owner"

  const [
    settings,
    users,
    domains,
    recurringBills,
    clients,
    legacySalesClients,
    items,
    vendors,
    cloudTypes,
    hostingPackages,
    servers,
    maintenances,
    cpanelAccounts,
  ] = await Promise.all([
    prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.domain.findMany({ include: { client: true }, orderBy: { name: "asc" } }),
    prisma.recurringBill.findMany({ include: { vendor: true, period: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.legacySalesClient.findMany({
      include: { client: { select: { id: true, name: true, picName: true, picPhone: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.item.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.cloudType.findMany({ orderBy: { name: "asc" } }),
    prisma.hostingPackage.findMany({ orderBy: { name: "asc" } }),
    prisma.server.findMany({ include: { vendor: true, cloudType: true, period: true, client: true }, orderBy: { name: "asc" } }),
    prisma.maintenance.findMany({ include: { client: true, period: true }, orderBy: { name: "asc" } }),
    prisma.cpanelAccount.findMany({ include: { cloudType: true, package: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pengaturan</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">{isOwner ? "Khusus Owner." : "Master Data."}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/pengaturan/pengembangan-sistem"
              className="text-xs sm:text-sm font-bold text-blue-700 hover:underline whitespace-nowrap"
            >
              Pengembangan Sistem &rarr;
            </Link>
            {isOwner && (
              <>
                <Link
                  href="/pengaturan/cek-konsistensi-data"
                  className="text-xs sm:text-sm font-bold text-blue-700 hover:underline whitespace-nowrap"
                >
                  Cek Konsistensi Data &rarr;
                </Link>
                <Link
                  href="/pengaturan/log-nonaktif"
                  className="text-xs sm:text-sm font-bold text-blue-700 hover:underline whitespace-nowrap"
                >
                  Log Nonaktif &rarr;
                </Link>
              </>
            )}
          </div>
        </div>

        <PengaturanPanel
          userRole={user.role}
          settings={{
            operasionalPct: settings.operasionalPct,
            direksiPct: settings.direksiPct,
            bonusPct: settings.bonusPct,
            defaultPpnRate: settings.defaultPpnRate,
            aiFollowUpEnabled: settings.aiFollowUpEnabled,
            paymentBankNamePpn: settings.paymentBankNamePpn,
            paymentAccountNamePpn: settings.paymentAccountNamePpn,
            paymentAccountNumberPpn: settings.paymentAccountNumberPpn,
            paymentBankNameNonPpn: settings.paymentBankNameNonPpn,
            paymentAccountNameNonPpn: settings.paymentAccountNameNonPpn,
            paymentAccountNumberNonPpn: settings.paymentAccountNumberNonPpn,
          }}
          users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, phoneNumber: u.phoneNumber, modules: u.modules }))}
          domains={domains.map((d) => ({
            ...d,
            lastPaidAt: d.lastPaidAt ? d.lastPaidAt.toISOString() : null,
            expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
          }))}
          recurringBills={recurringBills.map((b) => ({ ...b, lastPaidAt: b.lastPaidAt ? b.lastPaidAt.toISOString() : null }))}
          clients={clients}
          legacySalesClients={legacySalesClients}
          items={items}
          vendors={vendors}
          cloudTypes={cloudTypes}
          hostingPackages={hostingPackages}
          servers={servers.map((s) => ({
            ...s,
            lastPaidAt: s.lastPaidAt ? s.lastPaidAt.toISOString() : null,
            expiryDate: s.expiryDate ? s.expiryDate.toISOString() : null,
          }))}
          maintenances={maintenances.map((m) => ({
            ...m,
            lastPaidAt: m.lastPaidAt ? m.lastPaidAt.toISOString() : null,
            subscriptionStart: m.subscriptionStart ? m.subscriptionStart.toISOString() : null,
          }))}
          cpanelAccounts={cpanelAccounts}
        />
      </div>
    </AppLayout>
  )
}
