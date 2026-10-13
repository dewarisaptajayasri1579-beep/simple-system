import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Tingkatan harga per principle (per perusahaan) — diatur dari UI, tidak hardcode. */
export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const companyId = new URL(request.url).searchParams.get("companyId")
  if (!companyId) return NextResponse.json({ error: "companyId wajib" }, { status: 400 })

  const tiers = await prisma.principlePriceTier.findMany({ where: { companyId }, orderBy: { fromCount: "asc" } })
  return NextResponse.json(tiers)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengubah tingkatan harga" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; label?: string; fromCount?: number; toCount?: number | null; unitPrice?: number }
    | null
  const companyId = body?.companyId
  const label = body?.label?.trim()
  const fromCount = Number(body?.fromCount)
  const unitPrice = Number(body?.unitPrice)
  if (!companyId) return NextResponse.json({ error: "Perusahaan wajib dipilih" }, { status: 400 })
  if (!label) return NextResponse.json({ error: "Keterangan tingkatan wajib diisi" }, { status: 400 })
  if (!Number.isFinite(fromCount) || fromCount < 1) return NextResponse.json({ error: "Mulai dari principle ke- minimal 1" }, { status: 400 })
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: "Harga per principle tidak valid" }, { status: 400 })
  const toCount = body?.toCount == null || body.toCount === 0 ? null : Number(body.toCount)
  if (toCount != null && toCount < fromCount) {
    return NextResponse.json({ error: "Sampai principle ke- tidak boleh lebih kecil dari mulai" }, { status: 400 })
  }

  const tier = await prisma.principlePriceTier.create({
    data: { companyId, label, fromCount, toCount, unitPrice },
  })
  return NextResponse.json(tier, { status: 201 })
}
