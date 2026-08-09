import { COA_CODE } from "./coa-seed"
import type { JournalLineInput } from "./post-journal"

/** Invoice terbit: HPP diakui sekarang juga (akrual), dianggap sudah dibayar langsung dari
 *  Kas & Bank — bukan dicatat sebagai utang, karena biaya baris invoice (unitCost) tidak
 *  terhubung ke proses pelunasan vendor manapun di sistem ini (tidak ada yang pernah
 *  melunasi "Hutang Usaha Vendor", jadi mencatatnya sebagai liability cuma bikin saldo
 *  membengkak selamanya tanpa pernah bisa dilunasi). */
export function invoiceCostLines(input: { totalCost: number }): JournalLineInput[] {
  if (input.totalCost <= 0) return []
  return [
    { accountCode: COA_CODE.hpp, debit: input.totalCost, memo: "HPP" },
    { accountCode: COA_CODE.kasBankParent, credit: input.totalCost, memo: "HPP dibayar langsung" },
  ]
}

/** Invoice terbit: titik pengakuan pendapatan + piutang untuk ledger AKRUAL (beda dari
 *  Transaction cash-basis yang baru mengakui pendapatan saat dibayar — lihat invoicePaymentLines
 *  di bawah, yang sekarang cuma melunasi piutang ini, bukan lagi mengakui pendapatan). */
export function invoiceRevenueLines(input: {
  totalAmount: number
  ppnAmount: number
  /** Default COA_CODE.pendapatanJasa kalau tidak diisi — invoice yang sumbernya spesifik
   *  (mis. termin Project) kirim kode akun revenue-nya sendiri lewat Invoice.revenueCoaCode. */
  revenueCoaCode?: string
}): JournalLineInput[] {
  if (input.totalAmount <= 0) return []
  const revenueCoaCode = input.revenueCoaCode ?? COA_CODE.pendapatanJasa
  const lines: JournalLineInput[] = [
    { accountCode: COA_CODE.piutangUsaha, debit: input.totalAmount, memo: "Piutang invoice" },
    { accountCode: revenueCoaCode, credit: input.totalAmount - input.ppnAmount, memo: "Pendapatan" },
  ]
  if (input.ppnAmount > 0) {
    lines.push({ accountCode: COA_CODE.ppnKeluaran, credit: input.ppnAmount, memo: "PPN Keluaran" })
  }
  return lines
}

/** Pelunasan invoice (sebagian/penuh) di ledger akrual: pendapatan & PPN sudah diakui saat
 *  invoice terbit (invoiceRevenueLines), jadi di titik ini murni melunasi piutang — Kas/Bank
 *  masuk, Piutang Usaha berkurang sebesar yang dibayar. */
export function invoicePaymentLines(input: { kasBankCoaCode: string; amount: number }): JournalLineInput[] {
  return [
    { accountCode: input.kasBankCoaCode, debit: input.amount, memo: "Pelunasan invoice" },
    { accountCode: COA_CODE.piutangUsaha, credit: input.amount, memo: "Piutang dilunasi" },
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
