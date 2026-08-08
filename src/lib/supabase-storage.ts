const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "Simple OS"

/** Upload file sementara ke Supabase Storage (bucket public) — dipakai buat host gambar laporan
 *  WA sebelum dikasih ke WAHUB. Lebih reliable daripada nulis ke disk lokal container (yang bisa
 *  beda instance/hilang tiap redeploy di Coolify — lihat cron/dashboard-report.ts) dan lebih cepat
 *  daripada render on-demand (~20 detik, bikin WAHUB nunggu kelamaan sampai koneksinya bermasalah). */
export async function uploadToSupabaseStorage(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set")
  }

  const bucket = encodeURIComponent(BUCKET)
  const path = encodeURIComponent(filename)

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Gagal upload ke Supabase Storage (${res.status}): ${text.slice(0, 200)}`)
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/** Hapus file sementara setelah selesai dikirim — gagal diam-diam kalau ada masalah (bukan hal
 *  fatal, cuma numpuk sisa file, tidak menghalangi laporan yang sudah terkirim). */
export async function deleteFromSupabaseStorage(filename: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return
  const bucket = encodeURIComponent(BUCKET)
  const path = encodeURIComponent(filename)
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
  }).catch((e) => console.warn(`[supabase-storage] Gagal hapus ${filename}:`, e))
}
