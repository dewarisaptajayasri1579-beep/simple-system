import Link from "next/link"
import { Building2, Calculator, FileText, Users } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription, CardTitle } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"

const MENUS = [
  {
    href: "/blesscom/perusahaan",
    icon: Building2,
    title: "Perusahaan",
    desc: "Blesscom & Blessfull — client yang tagihannya dihitung per principle, beserta tingkatan harganya.",
  },
  {
    href: "/blesscom/principle",
    icon: Users,
    title: "Principle",
    desc: "Daftar principle per perusahaan. Tambah principle baru atau non-aktifkan beserta tanggalnya.",
  },
  {
    href: "/blesscom/invoice",
    icon: FileText,
    title: "Invoice Blesscom",
    desc: "Invoice Over Principle per bulan — nominal dihitung otomatis, lampiran daftar principle ikut tercetak.",
  },
  {
    href: "/blesscom/pengajuan",
    icon: Calculator,
    title: "Pengajuan Pekerjaan",
    desc: "Diskusi dengan AI untuk menentukan kategori & level pekerjaan — acuan Blesscom murni level, tanpa hitung bobot.",
  },
]

export default async function BlesscomHubPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Blesscom</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Tagihan bulanan Blesscom &amp; Blessfull yang dihitung dari jumlah principle aktif.
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
