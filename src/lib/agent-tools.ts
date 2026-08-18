import type Anthropic from "@anthropic-ai/sdk"

import { prisma } from "@/lib/prisma"
import { computeSplit } from "@/lib/split"
import { computeAllAccountBalances } from "@/lib/account-balance"
import { resolveDomainExpiry, getExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket, resolveServerExpiry } from "@/lib/recurring-bill-status"
import { formatJakartaDateLabel, jakartaTodayDateIso } from "@/lib/datetime"
import { generateTransactionNumber } from "@/lib/transaction-number"
import { invoiceCashDue } from "@/lib/invoice-due"

export interface ToolContext {
  mode: "staff" | "client"
  clientId?: string
  /** Staf mode saja — dipakai buat DeactivationLog (lihat logDeactivation di bawah). */
  actorId?: string
  actorName?: string
  command?: string
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

/** Dicatat tiap kali salah satu deactivate_* tool berhasil eksekusi — buat halaman Log Nonaktif
 *  (Pengaturan). Gagal diam-diam kalau context actor-nya kosong (mis. dipanggil dari jalur lain
 *  di masa depan yang belum threading context ini) — jangan sampai gagal log menggagalkan aksi
 *  utamanya (nonaktifin domain/server/biaya sudah kejadian, itu yang penting). */
async function logDeactivation(entityType: string, entityName: string, reason: string, context: ToolContext) {
  try {
    await prisma.deactivationLog.create({
      data: {
        entityType,
        entityName,
        reason,
        actorId: context.actorId ?? "unknown",
        actorName: context.actorName ?? context.actorId ?? "unknown",
        command: context.command ?? "",
      },
    })
  } catch (e) {
    console.error("[agent-tools] Gagal catat DeactivationLog:", e)
  }
}

// ---------------------------------------------------------------------------
// Tools untuk STAF (akses penuh, bukan di-scope ke client tertentu)
// ---------------------------------------------------------------------------

async function getOutstandingInvoices(input: { clientName?: string }) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["unpaid", "partial", "claimed_paid"] },
      client: input.clientName ? { name: { contains: input.clientName, mode: "insensitive" } } : undefined,
      postStatus: "posted",
    },
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
    orderBy: { dueDate: "asc" },
  })

  return invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    const remaining = invoiceCashDue(inv, inv.client.isPemungutPpn) - paid
    return {
      invoiceNumber: inv.invoiceNumber,
      client: inv.client.name,
      totalAmount: inv.totalAmount,
      remaining,
      remainingLabel: formatRupiah(remaining),
      status: inv.status,
      dueDateLabel: inv.dueDate ? formatJakartaDateLabel(inv.dueDate.toISOString().slice(0, 10)) : null,
    }
  })
}

async function getDomainsExpiring() {
  const domains = await prisma.domain.findMany({ where: { active: true }, include: { client: true } })
  return domains
    .map((d) => ({ domain: d, dueDate: resolveDomainExpiry(d), bucket: getExpiryBucket(resolveDomainExpiry(d)) }))
    .filter((r) => r.bucket !== "safe")
    .map((r) => ({
      name: r.domain.name,
      client: r.domain.client?.name ?? null,
      status: r.bucket,
      dueDateLabel: r.dueDate ? formatJakartaDateLabel(r.dueDate.toISOString().slice(0, 10)) : null,
      priceLabel: r.domain.sellPrice ? formatRupiah(r.domain.sellPrice) : null,
    }))
}

async function findDomainByName(input: { domainName: string }) {
  const domains = await prisma.domain.findMany({
    where: { name: { contains: input.domainName, mode: "insensitive" } },
    include: { client: true },
  })
  return domains.map((d) => ({
    name: d.name,
    client: d.client?.name ?? "Internal",
    active: d.active,
    sellPriceLabel: d.sellPrice ? formatRupiah(d.sellPrice) : null,
  }))
}

/** Dipanggil HANYA setelah pengguna konfirmasi eksplisit (lihat aturan di STAFF_SYSTEM_PROMPT) —
 *  langsung menghilangkan domain ini dari Dashboard (query di sana selalu filter active:true).
 *  "reason" wajib diisi — dicatat di DeactivationLog buat audit trail. */
async function deactivateDomain(input: { domainName: string; reason: string }, context: ToolContext) {
  if (!input.reason?.trim()) throw new Error("Alasan nonaktif wajib diisi")
  const domains = await prisma.domain.findMany({
    where: { name: { contains: input.domainName, mode: "insensitive" }, active: true },
  })
  if (domains.length === 0) throw new Error(`Domain aktif dengan nama "${input.domainName}" tidak ditemukan`)
  if (domains.length > 1) {
    return {
      ambiguous: true,
      matches: domains.map((d) => d.name),
      message: "Ada lebih dari satu domain aktif yang cocok dengan nama itu — sebutkan nama persisnya.",
    }
  }

  await prisma.domain.update({ where: { id: domains[0].id }, data: { active: false } })
  await logDeactivation("domain", domains[0].name, input.reason.trim(), context)
  return { ok: true, name: domains[0].name, message: `Domain ${domains[0].name} sudah dinonaktifkan, tidak akan muncul lagi di Dashboard.` }
}

async function getServersExpiring() {
  const servers = await prisma.server.findMany({ where: { active: true }, include: { period: true, client: true } })
  return servers
    .map((s) => ({
      server: s,
      dueDate: resolveServerExpiry(s),
      bucket: getExpiryBucket(resolveServerExpiry(s)),
    }))
    .filter((r) => r.bucket !== "safe")
    .map((r) => ({
      name: r.server.name,
      client: r.server.client?.name ?? null,
      status: r.bucket,
      dueDateLabel: r.dueDate ? formatJakartaDateLabel(r.dueDate.toISOString().slice(0, 10)) : null,
      priceLabel: r.server.price ? formatRupiah(r.server.price) : null,
    }))
}

async function findServerByName(input: { serverName: string }) {
  const servers = await prisma.server.findMany({
    where: { name: { contains: input.serverName, mode: "insensitive" } },
    include: { client: true },
  })
  return servers.map((s) => ({
    name: s.name,
    client: s.client?.name ?? "Internal",
    active: s.active,
    priceLabel: s.price ? formatRupiah(s.price) : null,
  }))
}

/** Padanan deactivateDomain buat Server — sama-sama langsung hilang dari Dashboard begitu
 *  active:false (query di sana selalu filter active:true). "reason" wajib diisi. */
async function deactivateServer(input: { serverName: string; reason: string }, context: ToolContext) {
  if (!input.reason?.trim()) throw new Error("Alasan nonaktif wajib diisi")
  const servers = await prisma.server.findMany({
    where: { name: { contains: input.serverName, mode: "insensitive" }, active: true },
  })
  if (servers.length === 0) throw new Error(`Server aktif dengan nama "${input.serverName}" tidak ditemukan`)
  if (servers.length > 1) {
    return {
      ambiguous: true,
      matches: servers.map((s) => s.name),
      message: "Ada lebih dari satu server aktif yang cocok dengan nama itu — sebutkan nama persisnya.",
    }
  }

  await prisma.server.update({ where: { id: servers[0].id }, data: { active: false } })
  await logDeactivation("server", servers[0].name, input.reason.trim(), context)
  return { ok: true, name: servers[0].name, message: `Server ${servers[0].name} sudah dinonaktifkan, tidak akan muncul lagi di Dashboard.` }
}

async function getRecurringBillsDue() {
  const bills = await prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } })
  return bills
    .map((b) => {
      const dueDate = computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount)
      return { bill: b, dueDate, bucket: getDueBucket(dueDate, b.period?.reminderDaysBefore ?? 7) }
    })
    .filter((r) => r.bucket !== "ok")
    .map((r) => ({
      name: r.bill.name,
      priceLabel: formatRupiah(r.bill.price ?? 0),
      status: r.bucket,
      dueDateLabel: r.dueDate ? formatJakartaDateLabel(r.dueDate.toISOString().slice(0, 10)) : null,
    }))
}

async function findRecurringBillByName(input: { billName: string }) {
  const bills = await prisma.recurringBill.findMany({
    where: { name: { contains: input.billName, mode: "insensitive" } },
  })
  return bills.map((b) => ({ name: b.name, category: b.category, active: b.active, priceLabel: b.price ? formatRupiah(b.price) : null }))
}

/** Padanan deactivateDomain buat Biaya Berkala — sama-sama langsung hilang dari Dashboard begitu
 *  active:false (query di sana selalu filter active:true). "reason" wajib diisi. */
async function deactivateRecurringBill(input: { billName: string; reason: string }, context: ToolContext) {
  if (!input.reason?.trim()) throw new Error("Alasan nonaktif wajib diisi")
  const bills = await prisma.recurringBill.findMany({
    where: { name: { contains: input.billName, mode: "insensitive" }, active: true },
  })
  if (bills.length === 0) throw new Error(`Biaya berkala aktif dengan nama "${input.billName}" tidak ditemukan`)
  if (bills.length > 1) {
    return {
      ambiguous: true,
      matches: bills.map((b) => b.name),
      message: "Ada lebih dari satu biaya berkala aktif yang cocok dengan nama itu — sebutkan nama persisnya.",
    }
  }

  await prisma.recurringBill.update({ where: { id: bills[0].id }, data: { active: false } })
  await logDeactivation("recurring_bill", bills[0].name, input.reason.trim(), context)
  return { ok: true, name: bills[0].name, message: `Biaya berkala ${bills[0].name} sudah dinonaktifkan, tidak akan muncul lagi di Dashboard.` }
}

async function recordExpense(input: { accountName: string; amount: number; description?: string; categoryName?: string }) {
  const account = await findAccountByName(input.accountName)
  if (!account) throw new Error(`Akun "${input.accountName}" tidak ditemukan`)

  const category = input.categoryName ? await findOrCreateCategory(input.categoryName, "expense") : null

  const transaction = await prisma.transaction.create({
    data: {
      transactionNumber: await generateTransactionNumber(prisma, "expense"),
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
      transactionNumber: await generateTransactionNumber(prisma, "income"),
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
  const client = await prisma.client.findUnique({ where: { id: clientId } })
  const invoices = await prisma.invoice.findMany({
    where: { clientId, status: { in: ["unpaid", "partial", "claimed_paid"] }, postStatus: "posted" },
    include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } },
    orderBy: { dueDate: "asc" },
  })
  return invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    const remaining = invoiceCashDue(inv, client?.isPemungutPpn ?? false) - paid
    return {
      invoiceNumber: inv.invoiceNumber,
      remaining,
      remainingLabel: formatRupiah(remaining),
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
    name: "find_domain_by_name",
    description: "Cari domain (aktif maupun nonaktif) berdasarkan nama — dipakai buat cek detail sebelum menonaktifkan domain.",
    input_schema: {
      type: "object",
      properties: { domainName: { type: "string", description: "Nama domain, boleh sebagian" } },
      required: ["domainName"],
    },
  },
  {
    name: "deactivate_domain",
    description:
      "Nonaktifkan domain — langsung hilang dari Dashboard. WAJIB cari dulu pakai find_domain_by_name dan minta konfirmasi eksplisit ke pengguna di pesan sebelumnya — jangan pernah panggil tool ini di pesan yang sama saat pengguna baru pertama kali minta. WAJIB juga minta & sertakan alasan nonaktifnya (reason) — jangan pernah panggil tool ini tanpa alasan yang jelas dari pengguna.",
    input_schema: {
      type: "object",
      properties: {
        domainName: { type: "string" },
        reason: { type: "string", description: "Alasan domain dinonaktifkan, wajib diisi" },
      },
      required: ["domainName", "reason"],
    },
  },
  {
    name: "get_servers_expiring",
    description: "Cek server yang sudah lewat, atau akan habis (jatuh tempo tagihan) bulan ini/bulan depan, lengkap tanggal & harga.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_server_by_name",
    description: "Cari server (aktif maupun nonaktif) berdasarkan nama — dipakai buat cek detail sebelum menonaktifkan server.",
    input_schema: {
      type: "object",
      properties: { serverName: { type: "string", description: "Nama server, boleh sebagian" } },
      required: ["serverName"],
    },
  },
  {
    name: "deactivate_server",
    description:
      "Nonaktifkan server — langsung hilang dari Dashboard. WAJIB cari dulu pakai find_server_by_name dan minta konfirmasi eksplisit ke pengguna di pesan sebelumnya — jangan pernah panggil tool ini di pesan yang sama saat pengguna baru pertama kali minta. WAJIB juga minta & sertakan alasan nonaktifnya (reason) — jangan pernah panggil tool ini tanpa alasan yang jelas dari pengguna.",
    input_schema: {
      type: "object",
      properties: {
        serverName: { type: "string" },
        reason: { type: "string", description: "Alasan server dinonaktifkan, wajib diisi" },
      },
      required: ["serverName", "reason"],
    },
  },
  {
    name: "get_recurring_bills_due",
    description: "Cek biaya berkala (kantor/pribadi) yang overdue atau segera jatuh tempo, lengkap tanggal & harga.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_recurring_bill_by_name",
    description: "Cari biaya berkala (aktif maupun nonaktif) berdasarkan nama — dipakai buat cek detail sebelum menonaktifkan.",
    input_schema: {
      type: "object",
      properties: { billName: { type: "string", description: "Nama biaya berkala, boleh sebagian" } },
      required: ["billName"],
    },
  },
  {
    name: "deactivate_recurring_bill",
    description:
      "Nonaktifkan biaya berkala — langsung hilang dari Dashboard. WAJIB cari dulu pakai find_recurring_bill_by_name dan minta konfirmasi eksplisit ke pengguna di pesan sebelumnya — jangan pernah panggil tool ini di pesan yang sama saat pengguna baru pertama kali minta. WAJIB juga minta & sertakan alasan nonaktifnya (reason) — jangan pernah panggil tool ini tanpa alasan yang jelas dari pengguna.",
    input_schema: {
      type: "object",
      properties: {
        billName: { type: "string" },
        reason: { type: "string", description: "Alasan biaya berkala dinonaktifkan, wajib diisi" },
      },
      required: ["billName", "reason"],
    },
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
    case "find_domain_by_name":
      return findDomainByName(input as { domainName: string })
    case "deactivate_domain":
      return deactivateDomain(input as { domainName: string; reason: string }, context)
    case "get_servers_expiring":
      return getServersExpiring()
    case "find_server_by_name":
      return findServerByName(input as { serverName: string })
    case "deactivate_server":
      return deactivateServer(input as { serverName: string; reason: string }, context)
    case "get_recurring_bills_due":
      return getRecurringBillsDue()
    case "find_recurring_bill_by_name":
      return findRecurringBillByName(input as { billName: string })
    case "deactivate_recurring_bill":
      return deactivateRecurringBill(input as { billName: string; reason: string }, context)
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
