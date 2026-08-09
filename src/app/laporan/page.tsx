import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardTitle, CardDescription } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { ShoppingCart, Landmark, Scale, TrendingUp, BookOpen, LineChart, Receipt, Clock } from "lucide-react"

const REPORTS = [
  { href: "/laporan/piutang", icon: Receipt, title: "Piutang", desc: "Daftar tagih — siapa saja yang masih berhutang." },
  {
    href: "/laporan/tindak-lanjut-tagihan",
    icon: Clock,
    title: "Tindak Lanjut Tagihan",
    desc: "Riwayat SLA penagihan Domain/Server/Maintenance — tepat waktu vs telat.",
  },
  { href: "/laporan/penjualan", icon: ShoppingCart, title: "Laporan Penjualan", desc: "Total invoice, tertagih, dan outstanding per periode." },
  { href: "/laporan/keuangan", icon: Landmark, title: "Laporan Keuangan", desc: "Rekap pemasukan & pengeluaran per kategori." },
  { href: "/laporan/neraca", icon: Scale, title: "Neraca", desc: "Aset, liabilitas, dan ekuitas terkini (cash-basis)." },
  { href: "/laporan/laba-rugi", icon: TrendingUp, title: "Laba Rugi", desc: "Pendapatan bersih dikurangi biaya operasional (cash-basis)." },
  { href: "/laporan/neraca-akrual", icon: BookOpen, title: "Neraca (Akrual)", desc: "Neraca sungguhan dari Jurnal Umum double-entry." },
  { href: "/laporan/laba-rugi-akrual", icon: LineChart, title: "Laba Rugi (Akrual)", desc: "Pendapatan diakui saat invoice terbit, bukan saat dibayar." },
]

export default async function LaporanHubPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Laporan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Pilih laporan yang mau dilihat.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {REPORTS.map(({ href, icon: Icon, title, desc }) => (
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
