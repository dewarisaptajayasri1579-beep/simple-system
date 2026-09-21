"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react"

const TABS = [
  { href: "/monitoring-keuangan/uang-masuk", label: "Uang Masuk", icon: ArrowDownCircle },
  { href: "/monitoring-keuangan/uang-keluar", label: "Uang Keluar", icon: ArrowUpCircle },
]

export const MonitoringKeuanganTabs: React.FC = () => {
  const pathname = usePathname() || ""

  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-slate-200/80 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/")
        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors ${
              isActive ? "text-blue-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {isActive && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-[#0544cc]" />}
          </Link>
        )
      })}
    </div>
  )
}
