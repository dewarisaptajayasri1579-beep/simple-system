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

  const updated = await prisma.$transaction(async (tx) => {
    // COA dibuat otomatis bersama akun ini. Saat nama akun diubah, ikut perbarui namanya
    // agar nama di dropdown dan Buku Besar tetap konsisten. Kode COA tidak berubah.
    if (account.coaAccountId && account.coaAccount?.name !== name) {
      await tx.chartOfAccount.update({ where: { id: account.coaAccountId }, data: { name } })
    }

    return tx.account.update({
      where: { id },
      data: {
        name,
        type: body?.type === "bank" ? "bank" : "kas",
        bankName: body?.type === "bank" && typeof body?.bankName === "string" ? body.bankName.trim() || null : null,
        accountNumber: typeof body?.accountNumber === "string" ? body.accountNumber.trim() || null : null,
        openingBalance: Number(body?.openingBalance) || 0,
      },
      include: { coaAccount: true },
    })
  })

  return NextResponse.json(updated)
}
