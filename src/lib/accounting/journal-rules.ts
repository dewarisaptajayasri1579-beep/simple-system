import { COA_CODE } from "./coa-seed"
import type { JournalLineInput } from "./post-journal"

/** Invoice terbit: BELUM ada pendapatan/piutang yang diakui — ini cash-basis, pendapatan
 *  baru diakui saat uang benar-benar masuk (lihat invoicePaymentLines). Piutang cuma
 *  tercatat sebagai catatan biasa di tabel Invoice, bukan akun GL.
 *  HPP tetap diakui sekarang juga (bukan nunggu dibayar), lawannya Hutang Usaha ke vendor —
 *  asumsi standar: biaya server/domain/hosting yang mendasari baru benar-benar dibayar
 *  belakangan lewat Biaya Berkala/Server, bukan langsung tunai saat invoice terbit. */
export function invoiceCostLines(input: { totalCost: number }): JournalLineInput[] {
  if (input.totalCost <= 0) return []
  return [
    { accountCode: COA_CODE.hpp, debit: input.totalCost, memo: "HPP" },
    { accountCode: COA_CODE.hutangUsahaVendor, credit: input.totalCost, memo: "Hutang ke vendor" },
  ]
}

/** Pelunasan invoice (sebagian/penuh): ini titik pengakuan pendapatan (cash-basis) — Kas/Bank
 *  masuk sebesar yang dibayar, lawannya Pendapatan Jasa. PPN Keluaran dipisah proporsional dari
 *  jumlah yang masuk (bukan dihitung sebagai pendapatan usaha) meski faktur pajak fisiknya
 *  dibuat manual di luar sistem. */
export function invoicePaymentLines(input: { kasBankCoaCode: string; amount: number; ppnPortion: number }): JournalLineInput[] {
  const ppnPortion = Math.min(input.ppnPortion, input.amount)
  const lines: JournalLineInput[] = [
    { accountCode: input.kasBankCoaCode, debit: input.amount, memo: "Pelunasan invoice" },
    { accountCode: COA_CODE.pendapatanJasa, credit: input.amount - ppnPortion, memo: "Pendapatan jasa" },
  ]
  if (ppnPortion > 0) {
    lines.push({ accountCode: COA_CODE.ppnKeluaran, credit: ppnPortion, memo: "PPN Keluaran" })
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
