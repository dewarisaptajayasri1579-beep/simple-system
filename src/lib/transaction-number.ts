import type { TxClient } from "@/lib/accounting/post-journal"
import { jakartaTodayDateIso } from "@/lib/datetime"

/** Nomor bukti Kas Keluar/Masuk — format BKK|BKM/{tahun}/{5 digit urut, reset tiap tahun},
 *  sama pola dengan PMT (payment-number.ts) & INV (invoice-number.ts). Dipanggil di DALAM tx
 *  yang sama dengan create Transaction-nya (supaya urut & tidak bentrok kalau > 1 baris dibuat
 *  sekaligus, mis. Kas Keluar multi-baris atau Pelunasan multi-invoice). */
export async function generateTransactionNumber(tx: TxClient, type: "income" | "expense"): Promise<string> {
  const year = Number(jakartaTodayDateIso().slice(0, 4))
  const prefix = `${type === "income" ? "BKM" : "BKK"}/${year}/`

  // Pakai nomor urut TERBESAR yang sudah ada (bukan COUNT baris) — kalau pakai COUNT, sekali ada
  // baris yang di-hapus (mis. draft transaction yang di-delete bareng payment/void-nya),
  // hitungannya mundur dan nomor baru bisa bentrok lagi dengan nomor yang sudah dipakai.
  const last = await tx.transaction.findFirst({
    where: { transactionNumber: { startsWith: prefix } },
    orderBy: { transactionNumber: "desc" },
    select: { transactionNumber: true },
  })
  const lastSeq = last?.transactionNumber ? Number(last.transactionNumber.slice(prefix.length)) : 0
  const next = String(lastSeq + 1).padStart(5, "0")
  return `${prefix}${next}`
}

/** Nomor bukti Pindah Buku — format BPB/{tahun}/{5 digit urut}, sama pola dengan
 *  generateTransactionNumber di atas, cuma tabelnya AccountTransfer. */
export async function generateTransferNumber(tx: TxClient): Promise<string> {
  const year = Number(jakartaTodayDateIso().slice(0, 4))
  const prefix = `BPB/${year}/`

  const last = await tx.accountTransfer.findFirst({
    where: { transferNumber: { startsWith: prefix } },
    orderBy: { transferNumber: "desc" },
    select: { transferNumber: true },
  })
  const lastSeq = last?.transferNumber ? Number(last.transferNumber.slice(prefix.length)) : 0
  const next = String(lastSeq + 1).padStart(5, "0")
  return `${prefix}${next}`
}
