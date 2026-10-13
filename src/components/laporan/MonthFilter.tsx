"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Button, Input } from "@/components/ui"

/** Pemilih bulan untuk laporan yang periodenya memang selalu 1 bulan (mis. Uang Masuk) —
 *  satu input `month`, bukan pasangan dari/sampai yang bisa salah pilih rentang. */
export const MonthFilter: React.FC<{ monthIso: string }> = ({ monthIso }) => {
  const router = useRouter()
  const pathname = usePathname()
  const [bulan, setBulan] = useState(monthIso)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input label="Bulan" type="month" sizeVariant="sm" value={bulan} onChange={(e) => setBulan(e.target.value)} />
      <Button variant="outline" size="sm" onClick={() => router.push(`${pathname}?bulan=${bulan}`)}>
        Terapkan
      </Button>
    </div>
  )
}
