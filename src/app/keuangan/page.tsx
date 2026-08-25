import { AppLayout } from "@/components/layout/AppLayout"
import { KeuanganPanel } from "@/components/keuangan/KeuanganPanel"
import { DraftTransactionsPanel } from "@/components/keuangan/DraftTransactionsPanel"
import { requirePageRole } from "@/lib/current-user"

export default async function KeuanganPage() {
  // Hub ini bundling Kas Keluar & Kas Masuk sekaligus — admin dibatasi cuma boleh Kas Keluar
  // (lihat /keuangan/kas-keluar terpisah), jadi hub-nya sendiri Owner+Direktur saja.
  const user = await requirePageRole(["owner", "direktur"])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Keuangan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Bayar domain, server, catat kas keluar/masuk, dan pelunasan piutang.</p>
        </div>

        <DraftTransactionsPanel />
        <KeuanganPanel />
      </div>
    </AppLayout>
  )
}
