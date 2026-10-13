"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"
import { Alert, Button, Card, Input, Spinner } from "@/components/ui"

export function FormGate({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function masuk() {
    if (!password) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/form/akses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal masuk")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal masuk")
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-5">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="text-center space-y-1 mb-5">
          <span className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-5 h-5" />
          </span>
          <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Form Pengajuan Pekerjaan</h1>
          <p className="text-xs text-slate-500 font-medium">Masukkan password yang diberikan admin.</p>
        </div>

        {!configured ? (
          <Alert variant="warning">Form belum dibuka — hubungi admin untuk mengatur passwordnya dulu.</Alert>
        ) : (
          <div className="space-y-3">
            <Input
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && masuk()}
              autoFocus
            />
            {error && <Alert variant="error">{error}</Alert>}
            <Button className="w-full" onClick={masuk} disabled={loading || !password}>
              {loading ? <Spinner size="sm" color="white" className="mr-2" /> : null}
              Masuk
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
