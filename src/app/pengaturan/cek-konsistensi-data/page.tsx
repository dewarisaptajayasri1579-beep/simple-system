import Link from "next/link"

import { AppLayout } from "@/components/layout/AppLayout"
import { CekKonsistensiDataPanel } from "@/components/pengaturan/CekKonsistensiDataPanel"
import { requirePageRole } from "@/lib/current-user"

export default async function CekKonsistensiDataPage() {
  const user = await requirePageRole(["owner"])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Cek Konsistensi Data</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Pengecekan lintas Invoice/Payment/Jurnal/SLA — lihat Konsistensi-Data.md untuk detail tiap invariant. Temuan "Cost-link belum ke-sync"
              dicek & disinkronkan otomatis tiap hari jam 05:30 WIB (kalau masih ada sisa, Owner dikabari lewat WA); jalankan manual di sini kapan saja
              buat cek langsung atau sinkronkan satu-satu.
            </p>
          </div>
          <Link href="/pengaturan" className="text-xs sm:text-sm font-bold text-blue-700 hover:underline whitespace-nowrap">
            &larr; Kembali ke Pengaturan
          </Link>
        </div>

        <CekKonsistensiDataPanel />
      </div>
    </AppLayout>
  )
}
