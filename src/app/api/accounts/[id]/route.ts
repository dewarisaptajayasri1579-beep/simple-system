import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa mengubah akun kas/bank" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama akun wajib diisi" }, { status: 400 })

  const account = await prisma.account.findUnique({ where: { id }, include: { coaAccount: true } })
  if (!account) return NextResponse.json({ error: "Akun kas/bank tidak ditemukan" }, { status: 404 })

  const duplicate = await prisma.account.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: id } } })
  if (duplicate) return NextResponse.json({ error: `Akun Kas/Bank "${duplicate.name}" sudah ada` }, { status: 400 })

  // coaAccountId dikirim eksplisit kalau staf pilih dari dropdown COA — kalau tidak dikirim sama
  // sekali, jangan ubah link COA-nya (biar endpoint ini tetap kompatibel dipanggil dari tempat
  // lain yang cuma update nama/saldo).
  const coaAccountIdProvided = typeof body?.coaAccountId === "string"
  const nextCoaAccountId = coaAccountIdProvided ? body.coaAccountId || null : account.coaAccountId

  if (nextCoaAccountId) {
    const targetCoa = await prisma.chartOfAccount.findUnique({ where: { id: nextCoaAccountId } })
    if (!targetCoa) return NextResponse.json({ error: "Akun COA yang dipilih tidak ditemukan" }, { status: 400 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Kalau COA-nya tidak diganti (masih yang lama, biasanya auto-dibuat bareng akun ini), ikut
    // perbarui namanya saat nama akun diubah, supaya nama di dropdown & Buku Besar tetap
    // konsisten. Kalau staf sengaja ganti ke COA lain lewat dropdown, jangan rename COA itu —
    // itu bisa akun COA yang dipakai bareng/sudah punya nama sendiri.
    if (nextCoaAccountId && nextCoaAccountId === account.coaAccountId && account.coaAccount?.name !== name) {
      await tx.chartOfAccount.update({ where: { id: nextCoaAccountId }, data: { name } })
    }

    return tx.account.update({
      where: { id },
      data: {
        name,
        type: body?.type === "bank" ? "bank" : "kas",
        bankName: body?.type === "bank" && typeof body?.bankName === "string" ? body.bankName.trim() || null : null,
        accountNumber: typeof body?.accountNumber === "string" ? body.accountNumber.trim() || null : null,
        openingBalance: Number(body?.openingBalance) || 0,
        coaAccountId: nextCoaAccountId,
      },
      include: { coaAccount: true },
    })
  })

  return NextResponse.json(updated)
}
