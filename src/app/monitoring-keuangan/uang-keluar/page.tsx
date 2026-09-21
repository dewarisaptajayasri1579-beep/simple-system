import { Card, CardTitle, CardDescription } from "@/components/ui"
import { ArrowUpCircle } from "lucide-react"

export default function UangKeluarPage() {
  return (
    <Card variant="panel" padding="lg">
      <div className="flex flex-col items-center text-center gap-3 py-8">
        <span className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-700 flex items-center justify-center">
          <ArrowUpCircle className="w-6 h-6" />
        </span>
        <CardTitle>Uang Keluar</CardTitle>
        <CardDescription>Rekap biaya berkala dan pengeluaran lainnya menyusul — belum dibuat.</CardDescription>
      </div>
    </Card>
  )
}
