import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { kasbonDisbursementLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { generateTransactionNumber } from "@/lib/transaction-number"
import { logTransactionEvent } from "@/lib/accounting/transaction-audit"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const kasbons = await prisma.employeeKasbon.findMany({
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { occurredAt: "desc" },
  })
  return NextResponse.json({ kasbons })
}

// Pencairan Kasbon karyawan — bikin EmployeeKasbon (status "outstanding") + Transaction
// (expense, refType="employee_kasbon") + jurnal draft debit Piutang Karyawan/kredit
// Kas-Bank. "Lunas" ditandai manual oleh HR (lihat PATCH [id]) — v1 tidak menghitung
// otomatis dari potongan gaji, lihat docs & plan Payroll.
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "direktur") {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa memberi Kasbon" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : ""
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const amount = Number(body?.amount) || 0
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const occurredAt = typeof body?.occurredAt === "string" && body.occurredAt ? new Date(body.occurredAt) : new Date()

  if (!employeeId) return NextResponse.json({ error: "Karyawan penerima wajib dipilih" }, { status: 400 })
  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal kasbon tidak valid" }, { status: 400 })

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } })
  if (!employee) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })

  try {
    const created = await prisma.$transaction(async (tx) => {
      const kasbon = await tx.employeeKasbon.create({
        data: { employeeId, amount, description: description || null, occurredAt, createdById: user.id },
      })

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: await generateTransactionNumber(tx, "expense"),
          accountId,
          type: "expense",
          grossAmount: amount,
          cost: 0,
          netAmount: amount,
          description: description || `Kasbon - ${employee.name}`,
          occurredAt,
          refType: "employee_kasbon",
          refId: kasbon.id,
          createdById: user.id,
        },
      })

      await logTransactionEvent(tx, { transactionId: transaction.id, action: "created", actorUserId: user.id, metadata: { via: "Kasbon Karyawan" } })

      const kasBankCoaCode = await getAccountCoaCode(tx, accountId)
      const journalEntry = await postJournalEntry(tx, {
        date: occurredAt,
        description: `Kasbon - ${employee.name}`,
        sourceType: "employee_kasbon",
        sourceId: kasbon.id,
        createdBy: user.id,
        lines: kasbonDisbursementLines({ kasBankCoaCode, amount }),
      })
      await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

      return { kasbon, transaction }
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan Kasbon" }, { status: 400 })
  }
}
