import type { TxClient } from "@/lib/accounting/post-journal"
import { jakartaTodayDateIso } from "@/lib/datetime"

/** Nomor bukti Kas Keluar/Masuk — format BKK|BKM/{tahun}/{5 digit urut, reset tiap tahun},
 *  sama pola dengan PMT (payment-number.ts) & INV (invoice-number.ts). Dipanggil di DALAM tx
 *  yang sama dengan create Transaction-nya (supaya urut & tidak bentrok kalau > 1 baris dibuat
 *  sekaligus, mis. Kas Keluar multi-baris atau Pelunasan multi-invoice). */
export async function generateTransactionNumber(tx: TxClient, type: "income" | "expense"): Promise<string> {
  const year = Number(jakartaTodayDateIso().slice(0, 4))
  const prefix = `${type === "income" ? "BKM" : "BKK"}/${year}/`

  const count = await tx.transaction.count({ where: { transactionNumber: { startsWith: prefix } } })
  const next = String(count + 1).padStart(5, "0")
  return `${prefix}${next}`
}
