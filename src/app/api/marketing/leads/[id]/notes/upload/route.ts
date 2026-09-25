import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { canActOnLead } from "@/lib/marketing/permissions"
import { uploadToSupabaseStorage } from "@/lib/supabase-storage"

const MAX_BYTES = 10 * 1024 * 1024

/** POST /api/marketing/leads/[id]/notes/upload — upload 1 gambar buat dilampirkan ke catatan
 *  internal lead (mis. screenshot GetContact). Cuma upload ke storage & balikin URL; catatannya
 *  sendiri tetap dibuat lewat POST .../notes dengan `imageUrl` hasil di sini — beda folder dari
 *  lampiran chat WA (marketing-chat/) karena ini internal, tidak pernah dikirim ke lead. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  if (!(await canActOnLead(user, id))) {
    return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "File kosong/tidak terkirim" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Gambar terlalu besar (maks 10MB)" }, { status: 400 })
  }

  const mimeType = file.type || "application/octet-stream"
  if (!mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "Hanya gambar yang bisa dilampirkan ke catatan" }, { status: 400 })
  }

  const originalName = file instanceof File ? file.name : "catatan.png"
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const filename = `marketing-lead-notes/${id}/${Date.now()}-${safeName}`

  try {
    const url = await uploadToSupabaseStorage(Buffer.from(await file.arrayBuffer()), filename, mimeType)
    return NextResponse.json({ url })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal upload gambar" }, { status: 500 })
  }
}
