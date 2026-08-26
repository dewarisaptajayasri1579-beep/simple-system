import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  })
  return NextResponse.json(settings)
}

export async function PATCH(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa ubah Pengaturan" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const data: Record<string, number | boolean | string | null> = {}
  if (typeof body?.operasionalPct === "number") data.operasionalPct = body.operasionalPct
  if (typeof body?.direksiPct === "number") data.direksiPct = body.direksiPct
  if (typeof body?.bonusPct === "number") data.bonusPct = body.bonusPct
  if (typeof body?.defaultPpnRate === "number") data.defaultPpnRate = body.defaultPpnRate
  if (typeof body?.aiFollowUpEnabled === "boolean") data.aiFollowUpEnabled = body.aiFollowUpEnabled
  for (const key of [
    "paymentBankNamePpn",
    "paymentAccountNamePpn",
    "paymentAccountNumberPpn",
    "paymentBankNameNonPpn",
    "paymentAccountNameNonPpn",
    "paymentAccountNumberNonPpn",
  ]) {
    if (typeof body?.[key] === "string") data[key] = body[key] || null
  }

  const total = (Number(data.operasionalPct) || 0) + (Number(data.direksiPct) || 0) + (Number(data.bonusPct) || 0)
  if (data.operasionalPct !== undefined && Math.abs(total - 100) > 0.01) {
    return NextResponse.json({ error: "Total persentase split harus 100%" }, { status: 400 })
  }

  // Slotting Omset — TERPISAH dari split operasionalPct/direksiPct/bonusPct di atas (lihat
  // catatan di schema.prisma model Settings).
  if (typeof body?.slottingOperasionalPct === "number") data.slottingOperasionalPct = body.slottingOperasionalPct
  if (typeof body?.slottingDireksiPct === "number") data.slottingDireksiPct = body.slottingDireksiPct
  if (typeof body?.slottingBonusPct === "number") data.slottingBonusPct = body.slottingBonusPct
  if (typeof body?.slottingHppReservePct === "number") data.slottingHppReservePct = body.slottingHppReservePct
  if (typeof body?.slottingTransferFee === "number") data.slottingTransferFee = body.slottingTransferFee
  for (const key of [
    "slottingOperasionalAccountId",
    "slottingDireksiAccountId",
    "slottingBonusAccountId",
    "slottingHppReserveAccountId",
  ]) {
    if (typeof body?.[key] === "string") data[key] = body[key] || null
  }

  const slottingTotal =
    (Number(data.slottingOperasionalPct) || 0) +
    (Number(data.slottingDireksiPct) || 0) +
    (Number(data.slottingBonusPct) || 0) +
    (Number(data.slottingHppReservePct) || 0)
  if (data.slottingOperasionalPct !== undefined && Math.abs(slottingTotal - 100) > 0.01) {
    return NextResponse.json({ error: "Total persentase Slotting Omset harus 100%" }, { status: 400 })
  }

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  })
  return NextResponse.json(settings)
}
