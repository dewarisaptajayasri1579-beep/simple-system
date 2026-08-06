import { COA_CODE } from "./coa-seed"
import type { JournalLineInput } from "./post-journal"

/** Invoice terbit: akui piutang + pendapatan (+ PPN Keluaran kalau ada) sekarang, bukan
 *  nunggu dibayar (ini inti dari accrual). HPP diakui berbarengan, lawannya Hutang Usaha
 *  ke vendor — asumsi standar: biaya server/domain/hosting yang mendasari baru benar-benar
 *  dibayar belakangan lewat Biaya Berkala/Server, bukan langsung tunai saat invoice terbit. */
export function invoiceCreatedLines(input: {
  totalAmount: number
  afterDiscount: number
  ppnAmount: number
  totalCost: number
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [
    { accountCode: COA_CODE.piutangUsaha, debit: input.totalAmount, memo: "Piutang invoice" },
    { accountCode: COA_CODE.pendapatanJasa, credit: input.afterDiscount, memo: "Pendapatan jasa" },
  ]
  if (input.ppnAmount > 0) {
    lines.push({ accountCode: COA_CODE.ppnKeluaran, credit: input.ppnAmount, memo: "PPN Keluaran" })
  }
  if (input.totalCost > 0) {
    lines.push({ accountCode: COA_CODE.hpp, debit: input.totalCost, memo: "HPP" })
    lines.push({ accountCode: COA_CODE.hutangUsahaVendor, credit: input.totalCost, memo: "Hutang ke vendor" })
  }
  return lines
}

/** Pelunasan invoice (sebagian/penuh): cuma menggeser Piutang -> Kas/Bank, pendapatan sudah
 *  diakui saat invoice terbit jadi tidak diakui ulang di sini. */
export function invoicePaymentLines(input: { kasBankCoaCode: string; amount: number }): JournalLineInput[] {
  return [
    { accountCode: input.kasBankCoaCode, debit: input.amount, memo: "Pelunasan invoice" },
    { accountCode: COA_CODE.piutangUsaha, credit: input.amount, memo: "Pelunasan invoice" },
  ]
}

/** Pemasukan manual (di luar invoice) — diakui langsung sebagai kas masuk + pendapatan;
 *  kalau ada biaya terkait (cost), sebagian kas itu juga langsung keluar lagi sebagai HPP. */
export function manualIncomeLines(input: {
  kasBankCoaCode: string
  revenueCoaCode: string
  grossAmount: number
  cost: number
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [
    { accountCode: input.kasBankCoaCode, debit: input.grossAmount, memo: "Pemasukan manual" },
    { accountCode: input.revenueCoaCode, credit: input.grossAmount, memo: "Pemasukan manual" },
  ]
  if (input.cost > 0) {
    lines.push({ accountCode: COA_CODE.hpp, debit: input.cost, memo: "Biaya terkait pemasukan" })
    lines.push({ accountCode: input.kasBankCoaCode, credit: input.cost, memo: "Biaya terkait pemasukan" })
  }
  return lines
}

/** Pengeluaran manual (Keuangan > Input Pengeluaran). */
export function manualExpenseLines(input: {
  kasBankCoaCode: string
  expenseCoaCode: string
  grossAmount: number
}): JournalLineInput[] {
  return [
    { accountCode: input.expenseCoaCode, debit: input.grossAmount, memo: "Pengeluaran manual" },
    { accountCode: input.kasBankCoaCode, credit: input.grossAmount, memo: "Pengeluaran manual" },
  ]
}

/** "Tandai Lunas" biaya berkala / server. */
export function billPaidLines(input: {
  kasBankCoaCode: string
  expenseCoaCode: string
  amount: number
}): JournalLineInput[] {
  return [
    { accountCode: input.expenseCoaCode, debit: input.amount, memo: "Pembayaran biaya berkala/server" },
    { accountCode: input.kasBankCoaCode, credit: input.amount, memo: "Pembayaran biaya berkala/server" },
  ]
}
