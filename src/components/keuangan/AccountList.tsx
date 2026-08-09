"use client"

import React, { useState } from "react"
import { Pencil } from "lucide-react"
import { Alert, Button, Card, CardDescription, CardHeader, CardTitle, CurrencyInput, FilterableTable, Input, Modal, Select, type FilterableColumn } from "@/components/ui"

export interface AccountRow {
  id: string
  name: string
  type: "kas" | "bank"
  bankName: string | null
  accountNumber: string | null
  openingBalance: number
  coa: { code: string; name: string } | null
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

const TYPE_OPTIONS = [
  { value: "kas", label: "Kas" },
  { value: "bank", label: "Bank" },
]

export const AccountList: React.FC<{ rows: AccountRow[]; canEdit: boolean }> = ({ rows: initialRows, canEdit }) => {
  const [rows, setRows] = useState(initialRows)
  const [editing, setEditing] = useState<AccountRow | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState<"kas" | "bank">("kas")
  const [bankName, setBankName] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [openingBalance, setOpeningBalance] = useState(0)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const openEdit = (account: AccountRow) => {
    setEditing(account)
    setName(account.name)
    setType(account.type)
    setBankName(account.bankName ?? "")
    setAccountNumber(account.accountNumber ?? "")
    setOpeningBalance(account.openingBalance)
    setError("")
  }

  const close = () => setEditing(null)

  const save = async () => {
    if (!editing || !name.trim()) {
      setError("Nama akun wajib diisi")
      return
    }
    setSaving(true)
    setError("")
    const res = await fetch(`/api/accounts/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, bankName, accountNumber, openingBalance }),
    })
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      setError(data?.error || "Gagal memperbarui akun")
      return
    }
    setRows((prev) => prev.map((row) => (row.id === editing.id ? { ...row, name: data.name, type: data.type, bankName: data.bankName, accountNumber: data.accountNumber, openingBalance: data.openingBalance, coa: data.coaAccount ? { code: data.coaAccount.code, name: data.coaAccount.name } : null } : row)))
    close()
  }

  const columns: FilterableColumn<AccountRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_row, index) => <span className="text-slate-500">{index + 1}</span> },
    { key: "name", header: "Nama Akun", filterValue: (a) => a.name, cellClassName: "font-semibold", cell: (a) => a.name },
    { key: "type", header: "Jenis", filterValue: (a) => a.type, filterOptions: TYPE_OPTIONS, cell: (a) => (a.type === "bank" ? "Bank" : "Kas") },
    { key: "bank", header: "Bank / No. Rekening", filterValue: (a) => `${a.bankName ?? ""} ${a.accountNumber ?? ""}`, cell: (a) => [a.bankName, a.accountNumber].filter(Boolean).join(" · ") || "-" },
    { key: "coa", header: "COA Terkait", filterValue: (a) => (a.coa ? `${a.coa.code} ${a.coa.name}` : ""), cell: (a) => (a.coa ? `${a.coa.code} — ${a.coa.name}` : "Belum terhubung") },
    { key: "openingBalance", header: "Saldo Awal", cellClassName: "font-semibold", cell: (a) => formatRupiah(a.openingBalance) },
    ...(canEdit
      ? [
          {
            key: "aksi",
            header: "Aksi",
            cell: (a: AccountRow) => (
              <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(a)} aria-label={`Edit ${a.name}`}>
                <Pencil className="w-4 h-4" />
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <>
      <Card variant="panel" padding="none">
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Akun Kas dan Bank</CardTitle>
          <CardDescription>Daftar akun yang tersedia saat mencatat kas masuk, kas keluar, dan pembayaran.</CardDescription>
        </CardHeader>
        <FilterableTable columns={columns} rows={rows} rowKey={(a) => a.id} emptyMessage="Belum ada akun kas/bank." searchPlaceholder="Cari akun, bank, atau COA..." />
      </Card>

      <Modal isOpen={editing !== null} onClose={close} title={editing ? `Edit Akun — ${editing.name}` : ""}>
        <div className="space-y-4">
          {error && <Alert variant="error" onClose={() => setError("")}>{error}</Alert>}
          <Input label="Nama Akun" value={name} onChange={(e) => setName(e.target.value)} />
          <Select label="Jenis" options={TYPE_OPTIONS} value={type} onChange={(value) => setType(value as "kas" | "bank")} />
          {type === "bank" && <Input label="Nama Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="mis. BCA" />}
          <Input label="No. Rekening (opsional)" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          <CurrencyInput label="Saldo Awal" value={openingBalance} onChange={setOpeningBalance} />
          <Input label="COA Terkait" value={editing?.coa ? `${editing.coa.code} — ${editing.coa.name}` : "Belum terhubung"} readOnly />
          <p className="text-xs text-slate-500">Nama COA akan ikut diperbarui jika nama akun diubah. Kode dan hubungan COA tetap dijaga.</p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={close}>Batal</Button>
            <Button type="button" variant="primary" onClick={save} isLoading={saving}>Simpan</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
