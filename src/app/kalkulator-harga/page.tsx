import Link from "next/link"
import { Inbox, ListChecks, Sparkles, Wallet } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription, CardTitle } from "@/components/ui"
import { summarizeAiUsage } from "@/lib/ai-usage"
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
  {
    href: "/kalkulator-harga/pengajuan",
    icon: Inbox,
    title: "Pengajuan Pekerjaan",
    desc: "Pekerjaan yang diposting programmer lewat form — lengkap dengan bobot dan total harganya.",
  },
]

const FEATURE_LABEL: Record<string, string> = {
  "kalkulator-harga": "Hitung Harga",
  "form-pekerjaan": "Form Programmer",
  "blesscom-pengajuan": "Pengajuan Blesscom",
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export default async function KalkulatorHargaHubPage() {
  const user = await getCurrentUser()

  // Biaya AI bulan berjalan — tanpa ini pemakaian AI cuma muncul sebagai satu angka di tagihan
  // Anthropic akhir bulan, tanpa ketahuan fitur mana yang memakannya.
  const awalBulan = new Date()
  awalBulan.setDate(1)
  awalBulan.setHours(0, 0, 0, 0)
  const biaya = await summarizeAiUsage(awalBulan)

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

        <Card padding="md" variant="feature">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">Biaya AI bulan ini</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {biaya.calls === 0
                  ? "Belum ada pemakaian bulan ini."
                  : biaya.perFeature
                      .map((f) => `${FEATURE_LABEL[f.feature] ?? f.feature}: ${formatRupiah(f.costIdr)} (${f.calls}×)`)
                      .join(" · ")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold text-slate-900 leading-tight">{formatRupiah(biaya.total)}</p>
              <p className="text-[11px] text-slate-500 font-medium">{biaya.calls} panggilan AI</p>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
