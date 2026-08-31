import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { canActOnLead } from "@/lib/marketing/permissions"
import { transcribeAudio } from "@/lib/marketing/transcribe"
import { uploadToSupabaseStorage } from "@/lib/supabase-storage"
import { prisma } from "@/lib/prisma"

const MAX_BYTES = 25 * 1024 * 1024 // batas OpenAI Whisper API sendiri

/** POST /api/marketing/leads/[id]/recordings — upload rekaman panggilan (multipart, field
 *  "audio") + transkrip otomatis lewat Whisper. Dipanggil dari tombol "Rekam Panggilan" di
 *  Detail Lead SETELAH staf klik "Selesai" — hasilnya cuma dipakai buat pre-fill form Aktivitas
 *  (staf tetap review/edit sebelum "Simpan Aktivitas", lihat POST .../activities), BUKAN
 *  langsung tersimpan jadi LeadActivity di sini. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  if (!(await canActOnLead(user, id))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  const form = await request.formData().catch(() => null)
  const audio = form?.get("audio")
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Rekaman kosong/tidak terkirim" }, { status: 400 })
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Rekaman terlalu besar (maks 25MB) — coba rekam lebih singkat" }, { status: 400 })
  }

  const mimeType = audio.type || "audio/webm"
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm"
  const buffer = Buffer.from(await audio.arrayBuffer())
  const filename = `marketing-recordings/${id}/${Date.now()}.${ext}`

  let attachmentUrl: string
  try {
    attachmentUrl = await uploadToSupabaseStorage(buffer, filename, mimeType)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal upload rekaman" }, { status: 500 })
  }

  // Rekaman sudah aman ke-upload di titik ini — kalau transkripsi gagal, tetap balikin
  // attachmentUrl-nya supaya rekamannya tidak hilang sia-sia, staf tinggal ketik catatan manual.
  try {
    const transcript = await transcribeAudio(buffer, filename, mimeType)
    return NextResponse.json({ attachmentUrl, transcript })
  } catch (err) {
    return NextResponse.json({
      attachmentUrl,
      transcript: null,
      transcribeError: err instanceof Error ? err.message : "Gagal transkrip rekaman",
    })
  }
}
