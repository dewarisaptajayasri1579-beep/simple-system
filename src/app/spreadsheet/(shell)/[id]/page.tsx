"use client"

import React, { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react"

import {
  Alert,
  Button,
  Card,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"

interface LinkedSpreadsheet {
  id: string
  name: string
  sourceUrl: string
  category: string | null
  description: string | null
}

interface SheetTab {
  sheetId: number
  title: string
}

interface RowsData {
  headers: string[]
  rows: string[][]
  truncated: boolean
}

export default function SpreadsheetDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [sheet, setSheet] = useState<LinkedSpreadsheet | null>(null)
  const [sheetError, setSheetError] = useState("")

  const [tabs, setTabs] = useState<SheetTab[]>([])
  const [tabsLoading, setTabsLoading] = useState(true)
  const [tabsError, setTabsError] = useState("")
  const [activeTab, setActiveTab] = useState<string | null>(null)

  const [data, setData] = useState<RowsData | null>(null)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [rowsError, setRowsError] = useState("")

  const loadSheet = async () => {
    const res = await fetch(`/api/spreadsheets/${id}`, { cache: "no-store" })
    const body = await res.json()
    if (!res.ok) {
      setSheetError(body.error || "Gagal memuat data spreadsheet")
      return
    }
    setSheet(body)
  }

  const loadTabs = async () => {
    setTabsLoading(true)
    setTabsError("")
    try {
      const res = await fetch(`/api/spreadsheets/${id}/tabs`, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) {
        setTabsError(body.error || "Gagal memuat daftar tab")
        return
      }
      setTabs(body.tabs || [])
      if (body.tabs?.length) setActiveTab(body.tabs[0].title)
    } finally {
      setTabsLoading(false)
    }
  }

  const loadRows = async (tab: string) => {
    setRowsLoading(true)
    setRowsError("")
    try {
      const res = await fetch(`/api/spreadsheets/${id}/rows?tab=${encodeURIComponent(tab)}`, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) {
        setRowsError(body.error || "Gagal memuat isi tab")
        setData(null)
        return
      }
      setData(body)
    } finally {
      setRowsLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    loadSheet()
    loadTabs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (activeTab) loadRows(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/spreadsheet" className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-900">{sheet?.name || "Spreadsheet"}</h1>
            {sheet?.description && <p className="text-sm text-slate-600 font-medium mt-1">{sheet.description}</p>}
          </div>
        </div>
        {sheet && (
          <a
            href={sheet.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800"
          >
            Buka di Google Sheets <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {sheetError && <Alert variant="error">{sheetError}</Alert>}

      {tabsLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tabsError ? (
        <Alert variant="error">{tabsError}</Alert>
      ) : tabs.length === 0 ? (
        <Card variant="glass" padding="lg" className="text-center">
          <p className="text-sm text-slate-600 font-medium">Sheet ini tidak punya tab.</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.sheetId}
                onClick={() => setActiveTab(tab.title)}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-colors ${
                  activeTab === tab.title ? "bg-blue-700 text-white shadow-sm" : "bg-white/70 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.title}
              </button>
            ))}
            <Button variant="outline" size="sm" onClick={() => activeTab && loadRows(activeTab)}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>

          {rowsError ? (
            <Alert variant="error">{rowsError}</Alert>
          ) : rowsLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : data ? (
            <>
              {data.truncated && (
                <Alert variant="warning">Menampilkan sebagian data saja (dibatasi jumlah baris/kolom).</Alert>
              )}
              <TableContainer className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {data.headers.map((h, i) => (
                        <TableHead key={i}>{h || `Kolom ${i + 1}`}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row, ri) => (
                      <TableRow key={ri}>
                        {row.map((cell, ci) => (
                          <TableCell key={ci}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
