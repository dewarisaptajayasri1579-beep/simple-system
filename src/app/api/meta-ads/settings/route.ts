import { NextResponse } from "next/server"

import { encryptSecret } from "@/lib/crypto"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Kredensial (Ad Account ID, Access Token) Owner-only di semua method — beda dari
 *  /api/meta-ads/campaigns yang boleh diakses SPV juga (lihat lib/meta-ads/access.ts). */
function isOwner(user: { role: string }) {
  return user.role === "owner"
}

/** access_token TIDAK pernah dikirim balik ke client (cuma tanda sudah/belum diisi) — sama
 *  perlakuan dengan VpsServer.sshPassword/coolifyApiToken di route monitoring. */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!isOwner(user)) return NextResponse.json({ error: "Cuma Owner yang bisa kelola kredensial Meta Ads" }, { status: 403 })

  const accounts = await prisma.metaAdsAccount.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      adAccountId: true,
      isActive: true,
      lastSyncError: true,
      lastSyncCheckedAt: true,
      createdAt: true,
    },
  })
  return NextResponse.json(accounts)
}

interface MetaAdsAccountInput {
  name?: string
  adAccountId?: string
  accessToken?: string
  isActive?: boolean
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola kredensial Meta Ads" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as MetaAdsAccountInput | null
  const name = body?.name?.trim()
  const adAccountId = body?.adAccountId?.trim()
  const accessToken = body?.accessToken?.trim()
  if (!name || !adAccountId || !accessToken) {
    return NextResponse.json({ error: "Nama, Ad Account ID, dan Access Token wajib diisi" }, { status: 400 })
  }

  const account = await prisma.metaAdsAccount.create({
    data: {
      name,
      adAccountId: adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`,
      accessToken: encryptSecret(accessToken),
      isActive: body?.isActive ?? true,
    },
    select: { id: true, name: true, adAccountId: true, isActive: true, createdAt: true },
  })
  return NextResponse.json(account, { status: 201 })
}

export async function PUT(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola kredensial Meta Ads" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as (MetaAdsAccountInput & { id?: string }) | null
  if (!body?.id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 })

  const existing = await prisma.metaAdsAccount.findUnique({ where: { id: body.id } })
  if (!existing) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 })

  const adAccountId = body.adAccountId?.trim()
  await prisma.metaAdsAccount.update({
    where: { id: body.id },
    data: {
      name: body.name?.trim() || existing.name,
      adAccountId: adAccountId ? (adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`) : existing.adAccountId,
      accessToken: body.accessToken?.trim() ? encryptSecret(body.accessToken.trim()) : existing.accessToken,
      isActive: body.isActive ?? existing.isActive,
      // reset status sync tiap kali kredensial diganti, supaya error lama tidak nyangkut
      lastSyncError: body.accessToken?.trim() ? null : existing.lastSyncError,
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola kredensial Meta Ads" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 })

  await prisma.metaAdsAccount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
