import { prisma } from "@/lib/prisma"
import { jakartaTodayDateIso } from "@/lib/datetime"

/** Format: INV/{tahun}/{5 digit berurut, reset tiap tahun}. Dipanggil di dalam transaksi
 *  create Invoice (lihat app/api/invoices/route.ts) supaya urut & tidak bentrok.
 *
 *  Pakai nomor urut TERBESAR yang sudah ada (bukan COUNT baris) — kalau pakai COUNT, sekali ada
 *  baris yang di-hapus, hitungannya mundur dan nomor baru bisa bentrok lagi dengan nomor yang
 *  sudah dipakai (unique constraint gagal). Format zero-padded jadi urutan string = urutan
 *  angka, aman diambil lewat orderBy desc + limit 1. */
export async function generateInvoiceNumber(): Promise<string> {
  const year = Number(jakartaTodayDateIso().slice(0, 4))
  const prefix = `INV/${year}/`

  const last = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  })
  const lastSeq = last ? Number(last.invoiceNumber.slice(prefix.length)) : 0
  const next = String(lastSeq + 1).padStart(5, "0")
  return `${prefix}${next}`
}
