"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"

import { Badge, Button, Card, Input, Modal, Spinner, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui"

interface PayrollPeriodSummary {
  id: string
  period: string
  status: "draft" | "posted"
  paidAt: string | null
  employeeCount: number
  totalNetPay: number
}

function fmtRupiah(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

export default function PenggajianPage() {
  const [periods, setPeriods] = useState<PayrollPeriodSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [periodInput, setPeriodInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/administratif/penggajian", { cache: "no-store" })
      const data = await res.json()
      setPeriods(Array.isArray(data.periods) ? data.periods : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    const now = new Date()
    setPeriodInput(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
    setError("")
    setModalOpen(true)
  }

  const handleHitung = async () => {
    if (!/^\d{4}-\d{2}$/.test(periodInput)) {
      setError("Format periode harus YYYY-MM")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/administratif/penggajian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: periodInput }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal menghitung")
        return
      }
      setModalOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Penggajian</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">Hitung gaji bulanan berdasarkan rekap absensi.</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Hitung Periode Baru
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : periods.length === 0 ? (
        <Card variant="glass" padding="lg" className="text-center">
          <p className="text-sm text-slate-600 font-medium">Belum ada periode gaji dihitung.</p>
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periode</TableHead>
                <TableHead>Karyawan</TableHead>
                <TableHead>Total Take Home Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dibayar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell className="font-bold">
                    <Link href={`/administratif/penggajian/${p.id}`} className="hover:text-blue-700">
                      {p.period}
                    </Link>
                  </TableCell>
                  <TableCell>{p.employeeCount} orang</TableCell>
                  <TableCell className={p.totalNetPay < 0 ? "text-rose-600 font-bold" : ""}>{fmtRupiah(p.totalNetPay)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "posted" ? "success" : "secondary"}>{p.status === "posted" ? "Sudah Dibayar" : "Draft"}</Badge>
                  </TableCell>
                  <TableCell>{p.paidAt ? new Date(p.paidAt).toLocaleDateString("id-ID") : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Hitung Periode Gaji"
        subtitle="Recompute penuh dari data absensi & izin periode itu."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleHitung} disabled={saving}>
              {saving ? "Menghitung..." : "Hitung"}
            </Button>
          </>
        }
      >
        <Input label="Periode (YYYY-MM)" placeholder="2026-09" value={periodInput} onChange={(e) => setPeriodInput(e.target.value)} error={error} />
      </Modal>
    </div>
  )
}
