import { prisma } from "@/lib/prisma"
import { jakartaTodayDateIso } from "@/lib/datetime"

/** Format: PMT/{tahun}/{5 digit berurut, reset tiap tahun}. Dipanggil di dalam transaksi
 *  create Payment (lihat app/api/payments/route.ts) supaya urut & tidak bentrok.
 *
 *  Pakai nomor urut TERBESAR yang sudah ada (bukan COUNT baris) — kalau pakai COUNT, sekali ada
 *  baris yang di-hapus (mis. draft payment yang di-delete), hitungannya mundur dan nomor baru
 *  bisa bentrok lagi dengan nomor yang sudah dipakai (unique constraint gagal). Format zero-
 *  padded jadi urutan string = urutan angka, aman diambil lewat orderBy desc + limit 1. */
export async function generatePaymentNumber(): Promise<string> {
  const year = Number(jakartaTodayDateIso().slice(0, 4))
  const prefix = `PMT/${year}/`

  const last = await prisma.payment.findFirst({
    where: { paymentNumber: { startsWith: prefix } },
    orderBy: { paymentNumber: "desc" },
    select: { paymentNumber: true },
  })
  const lastSeq = last ? Number(last.paymentNumber.slice(prefix.length)) : 0
  const next = String(lastSeq + 1).padStart(5, "0")
  return `${prefix}${next}`
}
