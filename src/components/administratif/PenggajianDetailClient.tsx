"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil, RefreshCw, Wallet } from "lucide-react"

import { Badge, Button, Card, CurrencyInput, Input, Modal, Select, Spinner, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui"

interface PayrollItem {
  id: string
  employee: { id: string; name: string; position: string | null }
  basicSalary: number
  positionAllowance: number
  attendanceAllowance: number
  transportAllowance: number
  overtimePay: number
  attendanceBonus: number
  otherEarnings: number
  bpjsKesehatan: number
  bpjsKetenagakerjaan: number
  kasbonDeduction: number
  otherDeductions: number
  daysPresent: number
  daysLeave: number
  daysAbsent: number
  grossPay: number
  totalDeduction: number
  netPay: number
}

interface PayrollPeriodDetail {
  id: string
  period: string
  status: "draft" | "posted"
  paidAt: string | null
  effectiveDays: number
  items: PayrollItem[]
  transaction: { id: string; transactionNumber: string | null; postStatus: string } | null
}

interface AccountOption {
  id: string
  name: string
}

function fmtRupiah(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

export function PenggajianDetailClient({ periodId: id }: { periodId: string }) {
  const [period, setPeriod] = useState<PayrollPeriodDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)

  const [editItem, setEditItem] = useState<PayrollItem | null>(null)
  const [editForm, setEditForm] = useState({ otherEarnings: 0, bpjsKesehatan: 0, bpjsKetenagakerjaan: 0, kasbonDeduction: 0, otherDeductions: 0 })
  const [editSaving, setEditSaving] = useState(false)

  const [payOpen, setPayOpen] = useState(false)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [payForm, setPayForm] = useState({ accountId: "", paidAt: new Date().toISOString().slice(0, 10) })
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/administratif/penggajian/${id}`, { cache: "no-store" })
      const data = await res.json()
      setPeriod(data.period ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const handleRecompute = async () => {
    if (!period) return
    setRecomputing(true)
    try {
      await fetch("/api/administratif/penggajian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: period.period }),
      })
      await load()
    } finally {
      setRecomputing(false)
    }
  }

  const openEdit = (item: PayrollItem) => {
    setEditItem(item)
    setEditForm({
      otherEarnings: item.otherEarnings,
      bpjsKesehatan: item.bpjsKesehatan,
      bpjsKetenagakerjaan: item.bpjsKetenagakerjaan,
      kasbonDeduction: item.kasbonDeduction,
      otherDeductions: item.otherDeductions,
    })
  }

  const handleSaveEdit = async () => {
    if (!editItem || !period) return
    setEditSaving(true)
    try {
      await fetch(`/api/administratif/penggajian/${period.id}/item/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      setEditItem(null)
      await load()
    } finally {
      setEditSaving(false)
    }
  }

  const openPay = async () => {
    setPayError("")
    setPayOpen(true)
    const res = await fetch("/api/accounts", { cache: "no-store" })
    const data = await res.json()
    setAccounts(Array.isArray(data) ? data : [])
  }

  const handlePay = async () => {
    if (!payForm.accountId) {
      setPayError("Akun kas/bank wajib dipilih")
      return
    }
    setPaySaving(true)
    setPayError("")
    try {
      const res = await fetch(`/api/administratif/penggajian/${id}/bayar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: payForm.accountId, paidAt: payForm.paidAt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPayError(data.error || "Gagal memproses pembayaran")
        return
      }
      setPayOpen(false)
      await load()
    } finally {
      setPaySaving(false)
    }
  }

  if (loading || !period) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const totalNet = period.items.reduce((s, i) => s + i.netPay, 0)
  const isDraft = period.status === "draft"

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/administratif/penggajian" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali
          </Link>
          <h1 className="text-xl font-black text-slate-900">Penggajian — {period.period}</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">
            {period.effectiveDays} hari efektif · Total Take Home Pay {fmtRupiah(totalNet)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={period.status === "posted" ? "success" : "secondary"}>{period.status === "posted" ? "Sudah Dibayar" : "Draft"}</Badge>
          {isDraft && (
            <Button variant="outline" onClick={handleRecompute} disabled={recomputing}>
              <RefreshCw className="w-4 h-4" /> {recomputing ? "Menghitung..." : "Hitung Ulang"}
            </Button>
          )}
          {isDraft && (
            <Button variant="primary" onClick={openPay}>
              <Wallet className="w-4 h-4" /> Bayar Gaji
            </Button>
          )}
        </div>
      </div>

      {period.transaction && (
        <Card variant="glass" padding="md">
          <p className="text-sm font-semibold text-slate-700">
            Transaksi: {period.transaction.transactionNumber ?? period.transaction.id} —{" "}
            <Badge variant={period.transaction.postStatus === "posted" ? "success" : "warning"} size="sm">
              {period.transaction.postStatus === "posted" ? "Terposting" : "Draft (belum diposting Owner)"}
            </Badge>
          </p>
        </Card>
      )}

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Hadir/Izin/Alfa</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Potongan</TableHead>
              <TableHead>Net Pay</TableHead>
              {isDraft && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {period.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-bold">
                  {item.employee.name}
                  <div className="text-xs text-slate-500 font-normal">{item.employee.position || "-"}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {item.daysPresent} / {item.daysLeave} / {item.daysAbsent}
                </TableCell>
                <TableCell>{fmtRupiah(item.grossPay)}</TableCell>
                <TableCell>{fmtRupiah(item.totalDeduction)}</TableCell>
                <TableCell className={item.netPay < 0 ? "text-rose-600 font-bold" : "font-bold"}>{fmtRupiah(item.netPay)}</TableCell>
                {isDraft && (
                  <TableCell className="text-right">
                    <button
                      onClick={() => openEdit(item)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                      aria-label="Edit potongan/tambahan"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Modal
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        title={`Edit — ${editItem?.employee.name ?? ""}`}
        subtitle="Komponen manual: pendapatan/potongan lain-lain, BPJS, dan potongan kasbon."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <CurrencyInput label="Pendapatan Lain-lain" value={editForm.otherEarnings} onChange={(v) => setEditForm({ ...editForm, otherEarnings: v })} />
          <CurrencyInput label="Potongan BPJS Kesehatan" value={editForm.bpjsKesehatan} onChange={(v) => setEditForm({ ...editForm, bpjsKesehatan: v })} />
          <CurrencyInput label="Potongan BPJS Ketenagakerjaan" value={editForm.bpjsKetenagakerjaan} onChange={(v) => setEditForm({ ...editForm, bpjsKetenagakerjaan: v })} />
          <CurrencyInput
            label="Potongan Kasbon"
            value={editForm.kasbonDeduction}
            onChange={(v) => setEditForm({ ...editForm, kasbonDeduction: v })}
            helperText="Cek sisa Kasbon karyawan ini di menu Kasbon sebelum isi nominal."
          />
          <CurrencyInput label="Potongan Lain-lain" value={editForm.otherDeductions} onChange={(v) => setEditForm({ ...editForm, otherDeductions: v })} />
        </div>
      </Modal>

      <Modal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        title="Bayar Gaji"
        subtitle={`Total ditransfer: ${fmtRupiah(totalNet)}. Bikin jurnal Kas Keluar (draft) di Akuntansi.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handlePay} disabled={paySaving}>
              {paySaving ? "Memproses..." : "Bayar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Akun Kas/Bank"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={payForm.accountId}
            onChange={(v) => setPayForm({ ...payForm, accountId: v })}
            error={payError}
          />
          <Input label="Tanggal Bayar" type="date" value={payForm.paidAt} onChange={(e) => setPayForm({ ...payForm, paidAt: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
