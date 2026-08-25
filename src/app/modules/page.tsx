import Link from "next/link"
import { redirect } from "next/navigation"
import { Landmark, Megaphone, ServerCog } from "lucide-react"

import { Card, CardTitle, CardDescription } from "@/components/ui"
import { AppLogo } from "@/components/ui/AppLogo"
import { ModuleLogoutButton } from "@/components/modules/ModuleLogoutButton"
import { getSessionUser } from "@/lib/auth"
import type { ModuleKey } from "@/lib/current-user"

const MODULE_CARDS: { key: ModuleKey; href: string; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "internal", href: "/dashboard", title: "Internal", desc: "Invoice, Pembayaran, Keuangan, Proyek, Laporan, Akuntansi.", icon: Landmark },
  { key: "marketing", href: "/marketing", title: "Marketing", desc: "Kelola Lead — prospek, follow-up, konversi.", icon: Megaphone },
  { key: "monitoring", href: "/monitoring", title: "Monitoring Server", desc: "Status & kesehatan server yang dipantau.", icon: ServerCog },
]

/** Halaman antara login dan masuk ke 1 modul — SENGAJA tidak pakai getCurrentUser() (itu
 *  default gate ke modul "internal", akan salah buat user yang cuma punya akses Marketing/
 *  Monitoring). Card yang muncul cuma yang ada di User.modules (Owner bypass, selalu lihat
 *  semua) — lihat catatan lengkap di lib/current-user.ts. */
export default async function ModulesPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const visibleCards = user.role === "owner" ? MODULE_CARDS : MODULE_CARDS.filter((m) => user.modules.includes(m.key))

  return (
    <div className="min-h-screen w-full bg-app-mesh flex flex-col p-4 sm:p-6 lg:p-8 font-sans relative overflow-x-hidden">
      <div className="dark:hidden absolute -top-40 -left-40 w-[500px] h-[500px] bg-blue-400/25 rounded-full blur-3xl pointer-events-none animate-pulse-subtle" />
      <div className="dark:hidden absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-indigo-500/25 rounded-full blur-3xl pointer-events-none animate-pulse-subtle" />

      <div className="flex items-center justify-between relative z-10">
        <AppLogo size="sm" layout="horizontal" showTagline={false} />
        <ModuleLogoutButton />
      </div>

      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-center relative z-10 py-10">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Pilih Modul</h1>
          <p className="text-sm text-slate-600 font-medium mt-1.5">Halo {user.name} — modul mana yang mau dibuka?</p>
        </div>

        {visibleCards.length === 0 ? (
          <Card variant="glass" padding="lg" className="max-w-md text-center">
            <p className="text-sm text-slate-600 font-medium">
              Akun kamu belum punya akses ke modul mana pun. Hubungi Owner untuk diberi akses.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full">
            {visibleCards.map(({ key, href, title, desc, icon: Icon }) => (
              <Link key={key} href={href}>
                <Card variant="glass" padding="lg" hoverable className="h-full flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription className="mt-1.5">{desc}</CardDescription>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
