import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** PATCH — ubah harga/keterangan 1 item acuan level. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  // Admin sengaja TIDAK termasuk: mengubah satu angka di sini menggeser harga semua pekerjaan
  // di kategori itu untuk tiap simulasi & pengajuan berikutnya — dan untuk Blesscom bahkan
  // menyentuh angka yang sudah disepakati dengan client. Admin tetap bisa membaca seluruh
  // rubrik & harganya, cuma tidak bisa mengubah.
  if (!["owner", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengubah acuan harga" }, { status: 403 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { price?: number; description?: string | null; blesscomPrice?: number | null }
    | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const item = await prisma.workPriceItem.update({
    where: { id },
    data: {
      ...(body.price !== undefined ? { price: Math.max(0, Math.round(body.price)) } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      // Harga Blesscom berdiri sendiri — diubah di sini tidak menyentuh `price` (turunan bobot),
      // dan sebaliknya kalibrasi bobot tidak menyentuh harga Blesscom.
      ...(body.blesscomPrice !== undefined
        ? { blesscomPrice: body.blesscomPrice === null ? null : Math.max(0, Math.round(body.blesscomPrice)) }
        : {}),
    },
  })
  return NextResponse.json(item)
}
