import { COA_CODE } from "./coa-seed"
import type { JournalLineInput } from "./post-journal"

/** Invoice terbit: TIDAK BIKIN JURNAL APA PUN (bukan Piutang, bukan Pendapatan, bukan HPP) —
 *  lihat aturan.txt: "Piutang hanya catatan, Pendapatan diakui setelah ada uang masuk". Piutang
 *  cukup dihitung dari Invoice.totalAmount − total InvoicePayment (field biasa, bukan akun GL).
 *  Semuanya (Pendapatan, PPN, DAN HPP) baru diakui SEKALIGUS saat Payment-nya diposting — lihat
 *  invoicePaymentLines di bawah. Detail lengkap: pedoman_akunting.md. */

/** Pelunasan invoice (sebagian/penuh), cash-basis: Kas/Bank masuk, DAN Pendapatan+PPN+HPP baru
 *  diakui SEKARANG — proporsional terhadap porsi invoice yang baru dibayar. `revenueCoaCode`
 *  di-resolve per invoice lewat `revenueCoaCodeForInvoice` (Domain/Server/Maintenance/Project
 *  sesuai costLinkType/revenueCoaCode invoice-nya, fallback Pendapatan Jasa). HPP dianggap
 *  sudah dibayar langsung dari Kas & Bank (bukan dicatat sebagai utang — tidak ada proses
 *  pelunasan "Hutang Usaha Vendor" di sistem ini). */
export function invoicePaymentLines(input: {
  kasBankCoaCode: string
  amount: number
  revenueCoaCode: string
  revenueAmount: number
  ppnAmount: number
  hppAmount: number
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [{ accountCode: input.kasBankCoaCode, debit: input.amount, memo: "Pelunasan invoice" }]
  if (input.revenueAmount > 0) lines.push({ accountCode: input.revenueCoaCode, credit: input.revenueAmount, memo: "Pendapatan" })
  if (input.ppnAmount > 0) lines.push({ accountCode: COA_CODE.ppnKeluaran, credit: input.ppnAmount, memo: "PPN Keluaran" })
  if (input.hppAmount > 0) {
    lines.push({ accountCode: COA_CODE.hpp, debit: input.hppAmount, memo: "HPP" })
    lines.push({ accountCode: input.kasBankCoaCode, credit: input.hppAmount, memo: "HPP dibayar langsung" })
  }
  return lines
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

/** "Tandai Lunas" biaya berkala / server. Tanpa memo generik di baris — biar Buku Besar
 *  jatuh ke journalEntry.description yang sudah spesifik (mis. "Pembayaran domain - nama.com"),
 *  bukan teks generik yang menutupi domain/server mana yang dibayar. */
export function billPaidLines(input: {
  kasBankCoaCode: string
  expenseCoaCode: string
  amount: number
}): JournalLineInput[] {
  return [
    { accountCode: input.expenseCoaCode, debit: input.amount },
    { accountCode: input.kasBankCoaCode, credit: input.amount },
  ]
}
