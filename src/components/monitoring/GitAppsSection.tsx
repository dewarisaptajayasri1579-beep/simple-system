"use client"

import React, { useEffect, useState } from "react"
import { Check, GitFork, KeyRound, Loader2 } from "lucide-react"

import { formatDateTimeId } from "@/lib/monitoring"

type GithubSourceRow = {
  id: string
  name: string
  isPublic: boolean
  hasToken: boolean
  tokenSetAt: string | null
}

type VpsGithubSources = {
  vpsId: string
  vpsName: string
  sources: GithubSourceRow[]
}

function TokenEditor({ source, onSaved }: { source: GithubSourceRow; onSaved: (updated: GithubSourceRow) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/monitoring/github-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "Gagal menyimpan token")
      }
      onSaved({ ...source, hasToken: Boolean(value.trim()), tokenSetAt: value.trim() ? new Date().toISOString() : null })
      setEditing(false)
      setValue("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan token")
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 cursor-pointer"
      >
        <KeyRound className="w-3.5 h-3.5" />
        {source.hasToken ? "Ganti Token" : "Isi Token"}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-sm">
      <div className="flex items-center gap-2">
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Personal Access Token GitHub"
          className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          disabled={saving || !value.trim()}
          onClick={handleSave}
          className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setValue("")
            setError(null)
          }}
          className="px-2 py-1.5 text-xs font-semibold text-slate-500 cursor-pointer"
        >
          Batal
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600 font-semibold">{error}</p>}
    </div>
  )
}

export const GitAppsSection: React.FC = () => {
  const [data, setData] = useState<VpsGithubSources[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/monitoring/github-sources")
      .then((r) => r.json())
      .then((d) => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  function handleSourceSaved(vpsId: string, updated: GithubSourceRow) {
    setData((prev) =>
      prev
        ? prev.map((vps) => (vps.vpsId !== vpsId ? vps : { ...vps, sources: vps.sources.map((s) => (s.id === updated.id ? updated : s)) }))
        : prev
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 font-medium py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Memuat Git Apps...
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-sm text-slate-500 font-medium">
        Belum ada Git App/Source GitHub yang tersinkron dari Coolify. Pastikan minimal 1 VPS sudah pernah di-sync.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {data.map((vps) => (
        <div key={vps.vpsId} className="glass-card rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-slate-800">{vps.vpsName}</h2>
          <div className="divide-y divide-slate-100">
            {vps.sources.map((source) => (
              <div key={source.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <GitFork className="w-4 h-4 text-slate-600" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{source.name}</p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {source.isPublic ? "Repo publik — token opsional" : "Repo privat — butuh token"}
                      {source.hasToken && (
                        <span className="text-emerald-600 font-bold ml-1.5 inline-flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Token terpasang{source.tokenSetAt ? ` (${formatDateTimeId(source.tokenSetAt)})` : ""}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <TokenEditor source={source} onSaved={(updated) => handleSourceSaved(vps.vpsId, updated)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
