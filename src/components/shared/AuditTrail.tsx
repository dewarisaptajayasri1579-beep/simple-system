function formatDateTime(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(
    new Date(iso)
  )
}

/** Baris "Dibuat oleh / Diposting oleh / Dibatalkan oleh" — dipakai di halaman detail
 *  Invoice/Payment/Transaction/Pindah Buku/Jurnal Umum, satu-satunya tempat yang nyusun
 *  tampilan ini biar konsisten. Nama null (user sudah dihapus atau baris lama sebelum kolom
 *  createdById ada) ditampilkan "-", bukan disembunyikan — biar jelas datanya memang tidak ada. */
export const AuditTrail: React.FC<{
  createdByName?: string | null
  postedByName?: string | null
  postedAt?: string | null
  voidedByName?: string | null
  voidedAt?: string | null
  voidReason?: string | null
}> = ({ createdByName, postedByName, postedAt, voidedByName, voidedAt, voidReason }) => {
  return (
    <div className="text-xs text-slate-500 font-medium space-y-1">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {createdByName !== undefined && <span>Dibuat oleh: <span className="font-semibold text-slate-700">{createdByName ?? "-"}</span></span>}
        {postedAt && (
          <span>
            Diposting oleh: <span className="font-semibold text-slate-700">{postedByName ?? "-"}</span> · {formatDateTime(postedAt)}
          </span>
        )}
      </div>
      {voidedAt && (
        <div className="text-rose-600">
          <div>
            Dibatalkan oleh: <span className="font-semibold">{voidedByName ?? "-"}</span> · {formatDateTime(voidedAt)}
          </div>
          {voidReason && <div className="mt-0.5">Alasan: {voidReason}</div>}
        </div>
      )}
    </div>
  )
}
