import Link from "next/link"
import { ListChecks, Sparkles } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription, CardTitle } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"

const MENUS = [
  {
    href: "/kalkulator-harga/acuan-level",
    icon: ListChecks,
    title: "Acuan Level",
    desc: "Daftar level, harga, dan keterangan kriteria tiap kategori pekerjaan — dasar acuan tim & AI.",
  },
  {
    href: "/kalkulator-harga/hitung-harga",
    icon: Sparkles,
    title: "Hitung Harga",
    desc: "Tulis deskripsi pekerjaan request client, AI akan menganalisa dan memperkirakan harganya.",
  },
]

export default async function KalkulatorHargaHubPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Kalkulator Harga</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Acuan harga pekerjaan custom request client, dan bantuan AI untuk memperkirakan harganya.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MENUS.map(({ href, icon: Icon, title, desc }) => (
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
