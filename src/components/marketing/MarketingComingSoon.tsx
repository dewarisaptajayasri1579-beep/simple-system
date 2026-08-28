import { Construction } from "lucide-react"

import { Card } from "@/components/ui"

/** Placeholder isi halaman modul Marketing yang belum dibangun. */
export const MarketingComingSoon: React.FC<{ title: string; note?: string }> = ({ title, note }) => (
  <Card variant="feature" padding="lg" className="flex flex-col items-center justify-center text-center gap-3 py-16">
    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
      <Construction className="w-7 h-7" />
    </div>
    <h1 className="text-xl font-black text-slate-900">{title}</h1>
    <p className="text-sm text-slate-600 font-medium max-w-sm">
      {note ?? "Halaman ini sedang dikembangkan — segera hadir."}
    </p>
  </Card>
)
