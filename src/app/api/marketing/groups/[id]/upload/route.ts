import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { canActOnGroup } from "@/lib/marketing/permissions"
import { uploadToSupabaseStorage } from "@/lib/supabase-storage"

const MAX_BYTES = 25 * 1024 * 1024

function inferMessageType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "IMAGE"
  if (mimeType.startsWith("audio/")) return "AUDIO"
  return "DOCUMENT"
}

/** POST /api/marketing/groups/[id]/upload — sama pola dengan conversations/[id]/upload, buat
 *  lampiran balasan Grup WA. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  if (!(await canActOnGroup(user, id))) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "File kosong/tidak terkirim" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File terlalu besar (maks 25MB)" }, { status: 400 })
  }

  const mimeType = file.type || "application/octet-stream"
  const originalName = file instanceof File ? file.name : "lampiran"
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const filename = `marketing-group-chat/${id}/${Date.now()}-${safeName}`

  try {
    const url = await uploadToSupabaseStorage(Buffer.from(await file.arrayBuffer()), filename, mimeType)
    return NextResponse.json({ url, messageType: inferMessageType(mimeType) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal upload file" }, { status: 500 })
  }
}
