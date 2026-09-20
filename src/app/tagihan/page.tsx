import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardTitle, CardDescription } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { Receipt, Clock, FilePlus2 } from "lucide-react"

// Hub penagihan (piutang + SLA tindak lanjut) — dipisah dari menu Laporan supaya role "admin"
// bisa kerja penagihan tanpa ikut kebuka laporan keuangan (Neraca/Laba Rugi/Arus Kas) yang
// sekarang Owner+Direktur saja. Lihat navItemsForRole di Sidebar.tsx.
const PAGES = [
  { href: "/tagihan/piutang", icon: Receipt, title: "Piutang", desc: "Daftar tagih — siapa saja yang masih berhutang." },
  {
    href: "/tagihan/tindak-lanjut",
    icon: Clock,
    title: "Tindak Lanjut Tagihan",
    desc: "Riwayat SLA penagihan Domain/Server/Maintenance — tepat waktu vs telat.",
  },
  {
    href: "/penjualan/baru",
    icon: FilePlus2,
    title: "Buat Invoice",
    desc: "Tarik tagihan Domain/Server/Maintenance/Termin Project yang jatuh tempo jadi invoice.",
  },
]

export default async function TagihanHubPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Tagihan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Semua yang berhubungan dengan menagih ke client.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PAGES.map(({ href, icon: Icon, title, desc }) => (
            <Link key={href} href={href}>
              <Card variant="feature" padding="lg" hoverable className="h-full">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription className="mt-1">{desc}</CardDescription>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
