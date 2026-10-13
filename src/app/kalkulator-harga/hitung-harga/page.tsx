import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { HitungHargaPanel } from "@/components/kalkulator-harga/HitungHargaPanel"
import { Button } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"

export default async function HitungHargaPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/kalkulator-harga">
            <Button variant="ghost" size="sm" aria-label="Kembali">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Hitung Harga</h1>
            <p className="text-[11px] sm:text-xs text-slate-600 font-medium">
              Diskusi dengan AI, bobotnya dinilai, harganya dihitung otomatis.
            </p>
          </div>
        </div>

        <HitungHargaPanel />
      </div>
    </AppLayout>
  )
}
