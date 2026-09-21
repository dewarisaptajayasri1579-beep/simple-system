"use client"

import React, { useEffect, useState } from "react"
import { Plus } from "lucide-react"

import { Badge, Button, Card, CurrencyInput, Input, Modal, Select, Spinner, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Textarea } from "@/components/ui"

interface EmployeeOption {
  id: string
  name: string
}

interface AccountOption {
  id: string
  name: string
}

interface EmployeeKasbon {
  id: string
  amount: number
  description: string | null
  occurredAt: string
  status: "outstanding" | "lunas"
  employee: { id: string; name: string }
}

function fmtRupiah(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

const emptyForm = { employeeId: "", accountId: "", amount: 0, description: "", occurredAt: new Date().toISOString().slice(0, 10) }

export default function KasbonPage() {
  const [kasbons, setKasbons] = useState<EmployeeKasbon[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const [kRes, eRes, aRes] = await Promise.all([
        fetch("/api/administratif/kasbon", { cache: "no-store" }),
        fetch("/api/administratif/karyawan", { cache: "no-store" }),
        fetch("/api/accounts", { cache: "no-store" }),
      ])
      const [kData, eData, aData] = await Promise.all([kRes.json(), eRes.json(), aRes.json()])
      setKasbons(Array.isArray(kData.kasbons) ? kData.kasbons : [])
      setEmployees(Array.isArray(eData.employees) ? eData.employees : [])
      setAccounts(Array.isArray(aData) ? aData : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setForm(emptyForm)
    setError("")
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.employeeId || !form.accountId || !form.amount) {
      setError("Karyawan, akun kas/bank, dan nominal wajib diisi")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/administratif/kasbon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan")
        return
      }
      setModalOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (kasbon: EmployeeKasbon) => {
    const nextStatus = kasbon.status === "outstanding" ? "lunas" : "outstanding"
    await fetch(`/api/administratif/kasbon/${kasbon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    })
    await load()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Kasbon Karyawan</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">
            Pencairan tercatat otomatis ke jurnal Piutang Karyawan. "Lunas" ditandai manual — cek di sini sebelum isi potongan Kasbon saat Penggajian.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Cairkan Kasbon
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : kasbons.length === 0 ? (
        <Card variant="glass" padding="lg" className="text-center">
          <p className="text-sm text-slate-600 font-medium">Belum ada kasbon.</p>
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Karyawan</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nominal</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kasbons.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-bold">{k.employee.name}</TableCell>
                  <TableCell>{new Date(k.occurredAt).toLocaleDateString("id-ID")}</TableCell>
                  <TableCell>{fmtRupiah(k.amount)}</TableCell>
                  <TableCell>{k.description || "-"}</TableCell>
                  <TableCell>
                    <button onClick={() => toggleStatus(k)}>
                      <Badge variant={k.status === "lunas" ? "success" : "warning"}>{k.status === "lunas" ? "Lunas" : "Outstanding"}</Badge>
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Cairkan Kasbon"
        subtitle="Bikin Transaction Kas Keluar (draft) — posting lewat halaman Transaksi/Keuangan."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Cairkan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Karyawan"
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            value={form.employeeId}
            onChange={(v) => setForm({ ...form, employeeId: v })}
            error={error}
          />
          <Select label="Akun Kas/Bank" options={accounts.map((a) => ({ value: a.id, label: a.name }))} value={form.accountId} onChange={(v) => setForm({ ...form, accountId: v })} />
          <CurrencyInput label="Nominal" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          <Input label="Tanggal" type="date" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
          <Textarea label="Catatan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>
      </Modal>
    </div>
  )
}
