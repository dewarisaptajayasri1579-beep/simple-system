import { Construction } from "lucide-react"

/** Placeholder isi halaman modul Marketing yang belum dibangun — dipakai sementara supaya
 *  navigasi (shell + bottom-nav) tidak 404. Ganti dengan konten asli per fase. */
export const MarketingComingSoon: React.FC<{ title: string; note?: string }> = ({ title, note }) => (
  <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
      <Construction className="w-7 h-7" />
    </div>
    <h1 className="text-xl font-black text-slate-900">{title}</h1>
    <p className="text-sm text-slate-600 font-medium max-w-sm">
      {note ?? "Halaman ini sedang dikembangkan — segera hadir."}
    </p>
  </div>
)
