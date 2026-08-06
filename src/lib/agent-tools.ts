import type Anthropic from "@anthropic-ai/sdk"

import { prisma } from "@/lib/prisma"
import { computeSplit } from "@/lib/split"
import { computeAllAccountBalances } from "@/lib/account-balance"
import { computeDomainExpiryDate, getExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"
import { formatJakartaDateLabel, jakartaTodayDateIso } from "@/lib/datetime"

export interface ToolContext {
  mode: "staff" | "client"
  clientId?: string
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

async function findAccountByName(name: string) {
  return prisma.account.findFirst({ where: { name: { contains: name, mode: "insensitive" } } })
}

async function findOrCreateCategory(name: string, kind: string) {
  const existing = await prisma.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
  if (existing) return existing
  return prisma.category.create({ data: { name, kind } })
}

// ---------------------------------------------------------------------------
// Tools untuk STAF (akses penuh, bukan di-scope ke client tertentu)
// ---------------------------------------------------------------------------

async function getOutstandingInvoices(input: { clientName?: string }) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["unpaid", "partial", "claimed_paid"] },
      client: input.clientName ? { name: { contains: input.clientName, mode: "insensitive" } } : undefined,
    },
    include: { client: true, payments: true },
    orderBy: { dueDate: "asc" },
  })

  return invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    return {
      invoiceNumber: inv.invoiceNumber,
      client: inv.client.name,
      totalAmount: inv.totalAmount,
      remaining: inv.totalAmount - paid,
      remainingLabel: formatRupiah(inv.totalAmount - paid),
      status: inv.status,
      dueDateLabel: inv.dueDate ? formatJakartaDateLabel(inv.dueDate.toISOString().slice(0, 10)) : null,
    }
  })
}

async function getDomainsExpiring() {
  const domains = await prisma.domain.findMany({ where: { active: true }, include: { client: true } })
  return domains
    .map((d) => ({ domain: d, bucket: getExpiryBucket(computeDomainExpiryDate(d.lastPaidAt)) }))
    .filter((r) => r.bucket !== "safe")
    .map((r) => ({ name: r.domain.name, client: r.domain.client?.name ?? null, status: r.bucket }))
}

async function getRecurringBillsDue() {
  const bills = await prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } })
  return bills
    .map((b) => ({
      bill: b,
      bucket: getDueBucket(computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount), b.period?.reminderDaysBefore ?? 7),
    }))
    .filter((r) => r.bucket !== "ok")
    .map((r) => ({ name: r.bill.name, priceLabel: formatRupiah(r.bill.price ?? 0), status: r.bucket }))
}

async function recordExpense(input: { accountName: string; amount: number; description?: string; categoryName?: string }) {
  const account = await findAccountByName(input.accountName)
  if (!account) throw new Error(`Akun "${input.accountName}" tidak ditemukan`)

  const category = input.categoryName ? await findOrCreateCategory(input.categoryName, "expense") : null

  const transaction = await prisma.transaction.create({
    data: {
      accountId: account.id,
      type: "expense",
      categoryId: category?.id,
      grossAmount: input.amount,
      cost: 0,
      netAmount: input.amount,
      description: input.description,
    },
  })
  return { ok: true, transactionId: transaction.id, amountLabel: formatRupiah(input.amount) }
}

async function recordIncome(input: { accountName: string; amount: number; cost?: number; description?: string; categoryName?: string }) {
  const account = await findAccountByName(input.accountName)
  if (!account) throw new Error(`Akun "${input.accountName}" tidak ditemukan`)

  const category = input.categoryName ? await findOrCreateCategory(input.categoryName, "income") : null
  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })
  const cost = input.cost ?? 0
  const split = computeSplit(input.amount, cost, {
    operasionalPct: settings.operasionalPct,
    direksiPct: settings.direksiPct,
    bonusPct: settings.bonusPct,
  })

  const transaction = await prisma.transaction.create({
    data: {
      accountId: account.id,
      type: "income",
      categoryId: category?.id,
      grossAmount: input.amount,
      cost,
      netAmount: split.netAmount,
      splitOperasionalPct: settings.operasionalPct,
      splitDireksiPct: settings.direksiPct,
      splitBonusPct: settings.bonusPct,
      operasionalAmount: split.operasionalAmount,
      direksiAmount: split.direksiAmount,
      bonusAmount: split.bonusAmount,
      description: input.description,
    },
  })
  return { ok: true, transactionId: transaction.id, netAmountLabel: formatRupiah(split.netAmount) }
}

async function getCashBalance() {
  const [accounts, balances] = await Promise.all([prisma.account.findMany(), computeAllAccountBalances()])
  return accounts.map((a) => ({ name: a.name, balanceLabel: formatRupiah(balances.get(a.id) ?? a.openingBalance) }))
}

async function getPendingBillCheckins() {
  const bills = await prisma.recurringBill.findMany({ where: { lastCheckinAt: { not: null } } })
  const pending = bills.filter((b) => !b.lastPaidAt || b.lastPaidAt < b.lastCheckinAt!)
  return pending.map((b) => ({ name: b.name, priceLabel: formatRupiah(b.price ?? 0) }))
}

async function markRecurringBillPaid(input: { billName: string }) {
  const bill = await prisma.recurringBill.findFirst({ where: { name: { contains: input.billName, mode: "insensitive" } } })
  if (!bill) throw new Error(`Biaya berkala "${input.billName}" tidak ditemukan`)

  await prisma.recurringBill.update({ where: { id: bill.id }, data: { lastPaidAt: new Date(), lastCheckinAt: null } })
  return { ok: true, name: bill.name }
}

// ---------------------------------------------------------------------------
// Tools untuk CLIENT (di-scope ke clientId sendiri — TIDAK bisa lihat data client lain)
// ---------------------------------------------------------------------------

async function getMyInvoices(clientId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { clientId, status: { in: ["unpaid", "partial", "claimed_paid"] } },
    include: { payments: true },
    orderBy: { dueDate: "asc" },
  })
  return invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    return {
      invoiceNumber: inv.invoiceNumber,
      remaining: inv.totalAmount - paid,
      remainingLabel: formatRupiah(inv.totalAmount - paid),
      dueDateLabel: inv.dueDate ? formatJakartaDateLabel(inv.dueDate.toISOString().slice(0, 10)) : null,
    }
  })
}

/** Client klaim sudah bayar — status jadi "claimed_paid", BUKAN "paid". Staf tetap wajib
 *  verifikasi mutasi rekening & input pembayaran sungguhan lewat menu Pelunasan Bertahap. */
async function claimPayment(clientId: string, input: { invoiceNumber: string; amount: number; notes?: string }) {
  const invoice = await prisma.invoice.findFirst({ where: { invoiceNumber: input.invoiceNumber, clientId } })
  if (!invoice) throw new Error(`Invoice "${input.invoiceNumber}" tidak ditemukan di akun Anda`)

  const claimNote = `[Klaim bayar ${jakartaTodayDateIso()}] ${formatRupiah(input.amount)}${input.notes ? ` — ${input.notes}` : ""}`
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "claimed_paid", notes: [invoice.notes, claimNote].filter(Boolean).join("\n") },
  })
  return { ok: true, message: "Klaim pembayaran dicatat, menunggu verifikasi staf." }
}

// ---------------------------------------------------------------------------
// Tool definitions (format Anthropic) & dispatcher
// ---------------------------------------------------------------------------

export const staffToolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_outstanding_invoices",
    description: "Cari daftar invoice yang belum lunas (unpaid/partial/claimed_paid), bisa difilter nama client.",
    input_schema: {
      type: "object",
      properties: { clientName: { type: "string", description: "Nama client, boleh sebagian" } },
    },
  },
  {
    name: "get_domains_expiring",
    description: "Cek domain yang sudah lewat, atau akan habis bulan ini/bulan depan.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_recurring_bills_due",
    description: "Cek biaya berkala (kantor/pribadi) yang overdue atau segera jatuh tempo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_cash_balance",
    description: "Lihat saldo semua akun Kas & Bank.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "record_expense",
    description: "Catat pengeluaran kantor.",
    input_schema: {
      type: "object",
      properties: {
        accountName: { type: "string", description: "Nama akun kas/bank, mis. 'Kas Utama'" },
        amount: { type: "number" },
        description: { type: "string" },
        categoryName: { type: "string", description: "Kategori, mis. 'Listrik', 'ATK'" },
      },
      required: ["accountName", "amount"],
    },
  },
  {
    name: "record_income",
    description: "Catat pemasukan manual di luar invoice (otomatis dipecah 40/50/10 sesuai pengaturan).",
    input_schema: {
      type: "object",
      properties: {
        accountName: { type: "string" },
        amount: { type: "number" },
        cost: { type: "number", description: "Biaya/HPP yang dipotong dulu sebelum split, kalau ada" },
        description: { type: "string" },
        categoryName: { type: "string" },
      },
      required: ["accountName", "amount"],
    },
  },
  {
    name: "get_pending_bill_checkins",
    description: "Cari biaya berkala yang sedang ditanya 'sudah dibayar?' dan menunggu balasan.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "mark_recurring_bill_paid",
    description: "Tandai biaya berkala sudah dibayar hari ini.",
    input_schema: {
      type: "object",
      properties: { billName: { type: "string" } },
      required: ["billName"],
    },
  },
]

export const clientToolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_my_invoices",
    description: "Lihat invoice/tagihan Anda yang belum lunas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "claim_payment",
    description: "Beritahu bahwa Anda sudah membayar sebuah invoice (akan diverifikasi staf dulu, belum otomatis lunas).",
    input_schema: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string" },
        amount: { type: "number" },
        notes: { type: "string" },
      },
      required: ["invoiceNumber", "amount"],
    },
  },
]

export async function runTool(name: string, input: Record<string, unknown>, context: ToolContext) {
  if (context.mode === "client") {
    if (!context.clientId) throw new Error("clientId tidak ada di context")
    switch (name) {
      case "get_my_invoices":
        return getMyInvoices(context.clientId)
      case "claim_payment":
        return claimPayment(context.clientId, input as { invoiceNumber: string; amount: number; notes?: string })
      default:
        throw new Error(`Tool "${name}" tidak tersedia untuk client`)
    }
  }

  switch (name) {
    case "get_outstanding_invoices":
      return getOutstandingInvoices(input as { clientName?: string })
    case "get_domains_expiring":
      return getDomainsExpiring()
    case "get_recurring_bills_due":
      return getRecurringBillsDue()
    case "get_cash_balance":
      return getCashBalance()
    case "record_expense":
      return recordExpense(input as { accountName: string; amount: number; description?: string; categoryName?: string })
    case "record_income":
      return recordIncome(input as { accountName: string; amount: number; cost?: number; description?: string; categoryName?: string })
    case "get_pending_bill_checkins":
      return getPendingBillCheckins()
    case "mark_recurring_bill_paid":
      return markRecurringBillPaid(input as { billName: string })
    default:
      throw new Error(`Tool "${name}" tidak dikenal`)
  }
}
