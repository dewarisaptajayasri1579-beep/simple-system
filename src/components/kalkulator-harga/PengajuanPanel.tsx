"use client"

import React, { useState } from "react"
import Link from "next/link"
import { Copy, FileText, Inbox, KeyRound, Link2 } from "lucide-react"
import { Alert, Button, Card, Input, Modal, Spinner } from "@/components/ui"

export interface PengajuanRow {
  id: string
  clientName: string
  programmerName: string
  status: string
  postedAtIso: string | null
  createdAtIso: string
  itemCount: number
  totalPoints: number
  totalPrice: number
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export function PengajuanPanel({ rows, formUrl, passwordSet, canManage }: { rows: PengajuanRow[]; formUrl: string; passwordSet: boolean; canManage: boolean }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function simpanPassword() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/kalkulator-harga/form-setting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan")
      setModalOpen(false)
      setPassword("")
      setNotice("Password form diperbarui. Semua sesi lama dicabut — programmer perlu memasukkan password baru.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  function salinLink() {
    navigator.clipboard?.writeText(formUrl)
    setNotice("Link form disalin.")
  }

  return (
    <div className="space-y-5">
      {notice && <Alert variant="success">{notice}</Alert>}

      <Card padding="md" variant="feature">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Link form untuk programmer</p>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{formUrl}</p>
            {!passwordSet && (
              <p className="text-xs text-amber-600 font-semibold mt-1">
                Password belum diatur — form masih tertutup.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={salinLink} leftIcon={<Copy className="w-4 h-4" />}>
              Salin
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)} leftIcon={<KeyRound className="w-4 h-4" />}>
                {passwordSet ? "Ganti Password" : "Atur Password"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg" variant="feature" className="text-center">
          <span className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-5 h-5" />
          </span>
          <p className="text-sm font-semibold text-slate-700">Belum ada pengajuan masuk.</p>
          <p className="text-xs text-slate-500 mt-1">Bagikan link di atas ke programmer beserta passwordnya.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/kalkulator-harga/pengajuan/${row.id}`}>
                <Card variant="solid" padding="sm" hoverable className="!rounded-2xl flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{row.clientName || "(tanpa nama client)"}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                      {row.programmerName || "(programmer tidak diisi)"} · {formatTanggal(row.postedAtIso ?? row.createdAtIso)} · {row.itemCount} pekerjaan ·{" "}
                      {row.totalPoints} poin
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-slate-900 whitespace-nowrap">{formatRupiah(row.totalPrice)}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Password Form Pengajuan">
        <div className="space-y-3">
          <p className="text-xs text-slate-600 font-medium">
            Password ini dipakai bersama semua programmer. Menggantinya akan mencabut semua sesi yang sedang aktif.
          </p>
          <Input
            type="password"
            label="Password baru"
            placeholder="Minimal 6 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={simpanPassword}
              disabled={saving || password.trim().length < 6}
              leftIcon={saving ? <Spinner size="sm" color="white" /> : undefined}
            >
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
