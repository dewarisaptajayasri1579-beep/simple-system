import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"

import { getCurrentUser } from "@/lib/current-user"
import { AppLogo } from "@/components/ui/AppLogo"
import { ModuleLogoutButton } from "@/components/modules/ModuleLogoutButton"
import { MonitoringDashboard } from "@/components/monitoring/MonitoringDashboard"

export default async function MonitoringPage() {
  const user = await getCurrentUser("monitoring")

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

      <main className="flex-1 mt-6 sm:mt-8">
        <MonitoringDashboard isOwner={user.role === "owner"} />
      </main>
    </div>
  )
}
