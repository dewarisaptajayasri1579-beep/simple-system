"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { KpiClient } from "./KpiClient"
import { ManagerDashboard } from "./ManagerDashboard"
import { LaporanClient } from "./LaporanClient"
import { FilterPills } from "./ui"

type AnalitikTab = "kpi" | "dashboard" | "laporan"
const VALID_TABS: AnalitikTab[] = ["kpi", "dashboard", "laporan"]

/** Hub "Analitik" — gabungan KPI (real-time pribadi/tim), Dashboard (snapshot performa segmen/
 *  kemampuan beli/tim), dan Laporan (historis per-tanggal: volume/kualitas/performa sales) yang
 *  sebelumnya 3 menu sidebar terpisah. Digabung supaya sidebar tidak terus bertambah panjang,
 *  ikut pola hub yang sudah dipakai modul Keuangan (`/laporan` menaungi banyak laporan di 1 menu).
 *  Tiap tab tetap komponen aslinya apa adanya (state/fetch sendiri-sendiri, tidak diubah), jadi
 *  judul section di dalam tiap tab (mis. "KPI") dobel-guna sebagai judul halaman — tidak perlu
 *  header "Analitik" terpisah di atasnya. */
export const AnalitikClient: React.FC = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab")
  const [tab, setTab] = useState<AnalitikTab>(VALID_TABS.includes(initialTab as AnalitikTab) ? (initialTab as AnalitikTab) : "kpi")

  useEffect(() => {
    router.replace(`/marketing/analitik?tab=${tab}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="flex flex-col gap-4">
      <FilterPills
        options={[
          { key: "kpi", label: "KPI" },
          { key: "dashboard", label: "Dashboard" },
          { key: "laporan", label: "Laporan" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as AnalitikTab)}
      />
      {tab === "kpi" && <KpiClient />}
      {tab === "dashboard" && <ManagerDashboard />}
      {tab === "laporan" && <LaporanClient />}
    </div>
  )
}
