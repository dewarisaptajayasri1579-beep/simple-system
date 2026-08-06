import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardTitle, CardDescription } from "@/components/ui"
import { requirePageRole } from "@/lib/current-user"
import { ListTree, BookOpen, ScrollText } from "lucide-react"

const PAGES = [
  { href: "/akuntansi/coa", icon: ListTree, title: "Chart of Accounts", desc: "Daftar akun untuk pembukuan akrual." },
  { href: "/akuntansi/jurnal", icon: BookOpen, title: "Jurnal Umum", desc: "Riwayat jurnal debit/kredit — otomatis & manual." },
  { href: "/akuntansi/buku-besar", icon: ScrollText, title: "Buku Besar", desc: "Saldo awal, mutasi debit/kredit, saldo akhir per akun." },
]

export default async function AkuntansiHubPage() {
  const user = await requirePageRole(["owner", "direktur"])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Akuntansi</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Pembukuan akrual — berjalan berdampingan dengan Keuangan (cash-basis).</p>
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
