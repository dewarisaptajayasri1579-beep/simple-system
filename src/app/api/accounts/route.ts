import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { COA_CODE } from "@/lib/accounting/coa-seed"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama akun wajib diisi" }, { status: 400 })

  const existingAccount = await prisma.account.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
  if (existingAccount) return NextResponse.json({ error: `Akun Kas/Bank "${existingAccount.name}" sudah ada` }, { status: 400 })

  const account = await prisma.$transaction(async (tx) => {
    const kasBankParent = await tx.chartOfAccount.findUnique({ where: { code: "1-1000" } })
    if (!kasBankParent) throw new Error('COA induk "1-1000 Kas & Bank" belum tersedia')

    // Kalau staf pilih COA eksplisit lewat dropdown, pakai itu. Kalau tidak, jatuhkan ke
    // pencarian berdasarkan nama yang sama seperti sebelumnya (atau buat otomatis).
    let coa = typeof body?.coaAccountId === "string" && body.coaAccountId
      ? await tx.chartOfAccount.findUnique({ where: { id: body.coaAccountId } })
      : null
    if (typeof body?.coaAccountId === "string" && body.coaAccountId && !coa) {
      throw new Error("Akun COA yang dipilih tidak ditemukan")
    }

    // Jika COA dengan nama yang sama sudah dibuat lebih dulu secara manual, pakai dan
    // hubungkan COA tersebut. Kalau belum ada, buat otomatis sebagai akun detail di
    // bawah Kas & Bank dengan nomor berikutnya (1-1001, 1-1002, dst.).
    if (!coa) {
      coa = await tx.chartOfAccount.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, type: "asset", parentId: kasBankParent.id },
      })
    }
    if (!coa) {
      const siblings = await tx.chartOfAccount.findMany({ where: { parentId: kasBankParent.id }, select: { code: true } })
      const lastNumber = siblings.reduce((highest, sibling) => {
        const match = /^1-(\d+)$/.exec(sibling.code)
        return match ? Math.max(highest, Number(match[1])) : highest
      }, 1000)
      coa = await tx.chartOfAccount.create({
        data: { code: `1-${String(lastNumber + 1).padStart(4, "0")}`, name, type: "asset", parentId: kasBankParent.id },
      })
    }

    const openingBalance = Number(body?.openingBalance) || 0

    const created = await tx.account.create({
      data: {
        name,
        type: body?.type === "bank" ? "bank" : "kas",
        bankName: body?.bankName || null,
        accountNumber: body?.accountNumber || null,
        openingBalance,
        coaAccountId: coa.id,
      },
      include: { coaAccount: true },
    })

    if (openingBalance !== 0) {
      const amount = Math.abs(openingBalance)
      await postJournalEntry(tx, {
        date: new Date(),
        description: `Saldo awal akun ${name}`,
        sourceType: "account_opening_balance",
        sourceId: created.id,
        createdBy: user.id,
        postStatus: "posted",
        lines:
          openingBalance > 0
            ? [
                { accountId: coa.id, debit: amount, memo: "Saldo awal" },
                { accountCode: COA_CODE.modal, credit: amount, memo: `Saldo awal — ${name}` },
              ]
            : [
                { accountCode: COA_CODE.modal, debit: amount, memo: `Saldo awal — ${name}` },
                { accountId: coa.id, credit: amount, memo: "Saldo awal" },
              ],
      })
    }

    return created
  })

  return NextResponse.json(account, { status: 201 })
}
