import { redirect } from "next/navigation"

// KPI, Dashboard, dan Laporan digabung jadi 1 hub "Analitik" — halaman ini dipertahankan
// sebagai redirect supaya link/bookmark lama tetap jalan.
export default function MarketingLaporanPage() {
  redirect("/marketing/analitik?tab=laporan")
}
