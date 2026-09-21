import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/current-user"
import { GitAppsSection } from "@/components/monitoring/GitAppsSection"

export default async function MonitoringGitAppsPage() {
  const user = await getCurrentUser("monitoring")
  if (user.role !== "owner" && user.role !== "admin" && user.role !== "sysadmin") redirect("/dashboard")

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Git Apps</h1>
        <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
          Akun GitHub (Git App/Source) yang terhubung ke Coolify tiap VPS — isi token di sini supaya commit log repo privat bisa ditampilkan di
          modul Monitoring.
        </p>
      </div>
      <GitAppsSection />
    </div>
  )
}
