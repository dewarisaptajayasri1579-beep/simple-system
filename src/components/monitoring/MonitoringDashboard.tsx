"use client"

import { useCallback, useEffect, useState } from "react"
import { HardDrive, Database, Users, Plus, Trash2, RefreshCw } from "lucide-react"

import { Card, CardHeader, CardTitle, CardDescription, Button, Input, Modal, Alert, Spinner } from "@/components/ui"
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table"

type DiskInfo = {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usedPct: number
  totalPretty: string
  usedPretty: string
  availablePretty: string
}

type DbSizeRow = {
  id: string
  name: string
  builtin: boolean
  sizeBytes: number | null
  sizePretty: string | null
  error: string | null
}

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  lastLoginAt: string | null
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Belum pernah login"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso))
}

export const MonitoringDashboard: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const [disk, setDisk] = useState<DiskInfo | null>(null)
  const [diskError, setDiskError] = useState("")
  const [dbRows, setDbRows] = useState<DbSizeRow[] | null>(null)
  const [dbError, setDbError] = useState("")
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [usersError, setUsersError] = useState("")
  const [loading, setLoading] = useState(true)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formConn, setFormConn] = useState("")
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)

  const loadAll = useCallback(async () => {
    setDiskError("")
    setDbError("")
    setUsersError("")

    const [diskRes, dbRes, usersRes] = await Promise.all([
      fetch("/api/monitoring/disk", { cache: "no-store" }),
      fetch("/api/monitoring/databases", { cache: "no-store" }),
      fetch("/api/monitoring/users", { cache: "no-store" }),
    ])

    if (diskRes.ok) setDisk(await diskRes.json())
    else setDiskError((await diskRes.json().catch(() => null))?.error || "Gagal memuat disk usage")

    if (dbRes.ok) setDbRows(await dbRes.json())
    else setDbError((await dbRes.json().catch(() => null))?.error || "Gagal memuat database")

    if (usersRes.ok) setUsers(await usersRes.json())
    else setUsersError((await usersRes.json().catch(() => null))?.error || "Gagal memuat user")
  }, [])

  useEffect(() => {
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  const handleAddDatabase = async () => {
    setFormError("")
    if (!formName.trim() || !formConn.trim()) {
      setFormError("Nama dan connection string wajib diisi")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/monitoring/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), connectionString: formConn.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFormError(data?.error || "Gagal menambah database")
        return
      }
      setIsAddOpen(false)
      setFormName("")
      setFormConn("")
      await loadAll()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDatabase = async (id: string) => {
    if (!confirm("Hapus database ini dari daftar pantauan?")) return
    await fetch(`/api/monitoring/databases/${id}`, { method: "DELETE" })
    await loadAll()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Monitoring Server</h1>
          <p className="text-sm text-slate-600 font-medium">Status & kesehatan server yang dipantau.</p>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={() => loadAll()}>
          Refresh
        </Button>
      </div>

      {/* Disk Space */}
      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-blue-600" /> Disk Space
          </CardTitle>
          <CardDescription>Penggunaan disk root (/) server tempat aplikasi ini berjalan.</CardDescription>
        </CardHeader>
        {diskError ? (
          <Alert variant="error">{diskError}</Alert>
        ) : disk ? (
          <div className="flex flex-col gap-3">
            <div className="w-full h-4 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${disk.usedPct >= 90 ? "bg-rose-500" : disk.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
                style={{ width: `${Math.min(disk.usedPct, 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm font-semibold text-slate-700">
              <span>Terpakai: <span className="font-black">{disk.usedPretty}</span> ({disk.usedPct}%)</span>
              <span>Tersisa: <span className="font-black">{disk.availablePretty}</span></span>
              <span>Total: <span className="font-black">{disk.totalPretty}</span></span>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Database Space */}
      <Card variant="glass" padding="lg">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" /> Database Space
            </CardTitle>
            <CardDescription>Ukuran database yang dipantau (Postgres).</CardDescription>
          </div>
          {isOwner && (
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsAddOpen(true)}>
              Tambah Database
            </Button>
          )}
        </CardHeader>
        {dbError ? (
          <Alert variant="error">{dbError}</Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Ukuran</TableHead>
                  {isOwner && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dbRows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-bold">{row.name}</TableCell>
                    <TableCell>
                      {row.error ? <span className="text-rose-600 font-semibold text-xs">{row.error}</span> : row.sizePretty}
                    </TableCell>
                    {isOwner && (
                      <TableCell className="text-right">
                        {!row.builtin && (
                          <button
                            onClick={() => handleDeleteDatabase(row.id)}
                            className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            aria-label="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Login Terakhir */}
      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-600" /> Login Terakhir
          </CardTitle>
          <CardDescription>Kapan terakhir tiap user login ke aplikasi ini.</CardDescription>
        </CardHeader>
        {usersError ? (
          <Alert variant="error">{usersError}</Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Login Terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-bold">{u.name}</TableCell>
                    <TableCell className="text-slate-600">{u.email}</TableCell>
                    <TableCell className="capitalize">{u.role}</TableCell>
                    <TableCell>{formatDateTime(u.lastLoginAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Modal
        isOpen={isAddOpen}
        onClose={() => !saving && setIsAddOpen(false)}
        title="Tambah Database Pantauan"
        subtitle="Connection string disimpan di server, dipakai buat cek ukuran database secara berkala."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleAddDatabase} isLoading={saving} loadingText="Menyimpan...">
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Input label="Nama" placeholder="mis. Director Assistant" value={formName} onChange={(e) => setFormName(e.target.value)} />
          <Input
            label="Connection String"
            placeholder="postgresql://user:password@host:5432/dbname"
            value={formConn}
            onChange={(e) => setFormConn(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
