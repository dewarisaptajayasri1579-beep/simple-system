import type { CoaType } from "./coa-seed"

/** Arah saldo normal per jenis akun — Aktiva (Aset/HPP/Beban) naik kalau didebit, Pasiva
 *  (Liabilitas/Ekuitas/Pendapatan) naik kalau dikredit. SATU-SATUNYA tempat aturan ini
 *  didefinisikan — dipakai oleh Neraca Akrual, Buku Besar, dan Laba Rugi Akrual supaya tidak
 *  ada dua definisi yang bisa saling drift. */
export function isDebitNormal(type: string): boolean {
  return type === "asset" || type === "cogs" || type === "expense"
}

export function accountMovement(type: CoaType | string, debit: number, credit: number): number {
  return isDebitNormal(type) ? debit - credit : credit - debit
}
