import { FilePlus2, Pencil, CheckCircle2, XCircle } from "lucide-react";

export interface ActivityLogEntry {
  id: string;
  action: "created" | "updated" | "posted" | "voided";
  actorName: string | null;
  createdAt: string;
  before: { accountId?: string; categoryId?: string | null; description?: string | null; grossAmount?: number } | null;
  after: { accountId?: string; categoryId?: string | null; description?: string | null; grossAmount?: number } | null;
  reason: string | null;
}

const ACTION_META: Record<ActivityLogEntry["action"], { label: string; icon: React.ElementType; color: string }> = {
  created: { label: "Dibuat", icon: FilePlus2, color: "text-slate-500" },
  updated: { label: "Direvisi", icon: Pencil, color: "text-amber-600" },
  posted: { label: "Diposting", icon: CheckCircle2, color: "text-emerald-600" },
  voided: { label: "Dibatalkan", icon: XCircle, color: "text-rose-600" },
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(
    new Date(iso)
  );
}
function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

/** Log Aktivitas — histori lengkap siapa input/simpan(revisi)/posting/batal dan kapan, ditaruh
 *  di bawah field input Kas Keluar/Masuk di halaman detail transaksi. BEDA dari `AuditTrail`
 *  (yang cuma nunjukin aktor TERAKHIR per aksi) — ini nunjukin SEMUA kejadian termasuk revisi
 *  berkali-kali, dari model `AuditLog` generik (lihat logTransactionEvent). */
export const TransactionActivityLog: React.FC<{ entries: ActivityLogEntry[] }> = ({ entries }) => {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Log Aktivitas</p>
      <ol className="space-y-3">
        {entries.map((e) => {
          const meta = ACTION_META[e.action];
          const Icon = meta.icon;
          const amountChanged = e.action === "updated" && e.before?.grossAmount !== undefined && e.after?.grossAmount !== undefined && e.before.grossAmount !== e.after.grossAmount;
          const descChanged = e.action === "updated" && e.before?.description !== e.after?.description;
          return (
            <li key={e.id} className="flex items-start gap-2.5 text-xs">
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${meta.color}`} />
              <div>
                <p className="font-semibold text-slate-700">
                  {meta.label} oleh <span className="font-bold text-slate-900">{e.actorName ?? "-"}</span>
                  <span className="text-slate-400 font-medium"> · {formatDateTime(e.createdAt)}</span>
                </p>
                {e.reason && <p className="text-rose-600 mt-0.5">Alasan: {e.reason}</p>}
                {amountChanged && (
                  <p className="text-slate-500 mt-0.5">
                    Nominal: {formatRupiah(e.before!.grossAmount!)} → {formatRupiah(e.after!.grossAmount!)}
                  </p>
                )}
                {descChanged && (
                  <p className="text-slate-500 mt-0.5">
                    Keterangan: &quot;{e.before?.description || "-"}&quot; → &quot;{e.after?.description || "-"}&quot;
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
