"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { TriangleAlert } from "lucide-react"

import {
  Alert,
  Card,
  SkeletonList,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { MktHeader } from "./ui"

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

  if (loading) return <SkeletonList rows={6} />
  if (error) return <Alert variant="error">{error}</Alert>

  return (
    <div className="flex flex-col gap-5">
      <MktHeader title="Tim" />

      {warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Early Warning</h2>
          {warnings.map((w, i) => (
            <Alert key={i} variant={w.severity === "high" ? "error" : "warning"}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <TriangleAlert className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate font-semibold">{w.text}</span>
                </span>
                <Link href={w.cta.href} className="text-xs font-bold text-blue-700 flex-shrink-0">
                  {w.cta.label}
                </Link>
              </div>
            </Alert>
          ))}
        </div>
      )}

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sales</TableHead>
              <TableHead className="text-right">Lead Aktif</TableHead>
              <TableHead className="text-right">Hot</TableHead>
              <TableHead className="text-right">FU Hari Ini</TableHead>
              <TableHead className="text-right">FU Telat</TableHead>
              <TableHead className="text-right">Chat Blm Dibalas</TableHead>
              <TableHead className="text-right">Won (bln ini)</TableHead>
              <TableHead className="text-right">On-Time FU</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const rate =
                m.followUpCompletedThisMonth > 0
                  ? Math.round((m.followUpOnTimeThisMonth / m.followUpCompletedThisMonth) * 100)
                  : null
              return (
                <TableRow key={m.userId}>
                  <TableCell>
                    <Link href={`/marketing/tim/${m.userId}`} className="font-bold text-slate-800 hover:text-blue-700">
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{m.activeLeads}</TableCell>
                  <TableCell className="text-right font-bold text-rose-600">{m.hotLeads || ""}</TableCell>
                  <TableCell className="text-right">{m.followUpToday || ""}</TableCell>
                  <TableCell className={`text-right font-bold ${m.followUpOverdue > 0 ? "text-amber-600" : "text-slate-400"}`}>
                    {m.followUpOverdue || ""}
                  </TableCell>
                  <TableCell className="text-right">{m.unrepliedChats || ""}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-600">{m.wonThisMonth || ""}</TableCell>
                  <TableCell className="text-right">{rate == null ? "—" : `${rate}%`}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {members.length === 0 && (
        <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
          Belum ada anggota tim.
        </Card>
      )}
    </div>
  )
}
