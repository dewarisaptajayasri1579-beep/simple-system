"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { TriangleAlert } from "lucide-react"

interface Member {
  userId: string
  name: string
  activeLeads: number
  hotLeads: number
  followUpToday: number
  followUpOverdue: number
  unrepliedChats: number
  wonThisMonth: number
  followUpCompletedThisMonth: number
  followUpOnTimeThisMonth: number
}

interface Warning {
  severity: "high" | "medium"
  text: string
  userId: string | null
  cta: { label: string; href: string }
}

export const TeamBoard: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([])
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/marketing/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else {
          setMembers(d.members)
          setWarnings(d.warnings)
        }
      })
      .catch(() => setError("Gagal memuat"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>
  if (error) return <p className="text-sm font-semibold text-rose-600 py-10 text-center">{error}</p>

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-black text-slate-900">Tim</h1>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Early Warning</h2>
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`flex items-center justify-between gap-3 p-3 rounded-2xl border ${
                w.severity === "high" ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <TriangleAlert className={`w-4 h-4 flex-shrink-0 ${w.severity === "high" ? "text-rose-600" : "text-amber-600"}`} />
                <p className="text-sm font-semibold text-slate-700 truncate">{w.text}</p>
              </div>
              <Link href={w.cta.href} className="text-xs font-bold text-blue-700 flex-shrink-0">
                {w.cta.label}
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 font-bold">
            <tr>
              <th className="text-left px-3 py-2.5">Sales</th>
              <th className="text-right px-3 py-2.5">Lead Aktif</th>
              <th className="text-right px-3 py-2.5">Hot</th>
              <th className="text-right px-3 py-2.5">FU Hari Ini</th>
              <th className="text-right px-3 py-2.5">FU Telat</th>
              <th className="text-right px-3 py-2.5">Chat Blm Dibalas</th>
              <th className="text-right px-3 py-2.5">Won (bln ini)</th>
              <th className="text-right px-3 py-2.5">On-Time FU</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const rate =
                m.followUpCompletedThisMonth > 0
                  ? Math.round((m.followUpOnTimeThisMonth / m.followUpCompletedThisMonth) * 100)
                  : null
              return (
                <tr key={m.userId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/marketing/tim/${m.userId}`} className="font-bold text-slate-800 hover:text-blue-700">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right">{m.activeLeads}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-rose-600">{m.hotLeads || ""}</td>
                  <td className="px-3 py-2.5 text-right">{m.followUpToday || ""}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${m.followUpOverdue > 0 ? "text-amber-600" : "text-slate-400"}`}>
                    {m.followUpOverdue || ""}
                  </td>
                  <td className="px-3 py-2.5 text-right">{m.unrepliedChats || ""}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{m.wonThisMonth || ""}</td>
                  <td className="px-3 py-2.5 text-right">{rate == null ? "—" : `${rate}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
