import Link from "next/link"
import { ArrowLeftRight, Construction } from "lucide-react"

import { Card } from "@/components/ui"
import { AppLogo } from "@/components/ui/AppLogo"
import { ModuleLogoutButton } from "@/components/modules/ModuleLogoutButton"

/** Shell sementara buat modul baru (Marketing/Monitoring) yang belum ada fitur/isinya — dipakai
 *  sampai halaman-halaman asli modul itu dibangun. Begitu modul itu punya layout/sidebar sendiri,
 *  ganti pemakaian ini, jangan dikembangin jadi layout permanen. */
export const ModulePlaceholder: React.FC<{
  moduleTitle: string
  description: string
  action?: { href: string; label: string }
}> = ({ moduleTitle, description, action }) => {
  return (
    <div className="min-h-screen w-full bg-app-mesh flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
      <div className="flex items-center justify-between">
        <AppLogo size="sm" layout="horizontal" showTagline={false} />
        <div className="flex items-center gap-5">
          <Link href="/modules" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeftRight className="w-4 h-4" /> Ganti Modul
          </Link>
          <ModuleLogoutButton />
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center">
        <Card variant="glass" padding="lg" className="max-w-md text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Construction className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black text-slate-900">{moduleTitle}</h1>
          <p className="text-sm text-slate-600 font-medium">{description}</p>
          {action && (
            <Link
              href={action.href}
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-bold hover:bg-blue-800 transition-colors"
            >
              {action.label}
            </Link>
          )}
        </Card>
      </main>
    </div>
  )
}
