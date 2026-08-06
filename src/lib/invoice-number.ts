import { prisma } from "@/lib/prisma"
import { jakartaTodayDateIso } from "@/lib/datetime"

/** Format: INV/{tahun}/{5 digit berurut, reset tiap tahun}. Dipanggil di dalam transaksi
 *  create Invoice (lihat app/api/invoices/route.ts) supaya urut & tidak bentrok. */
export async function generateInvoiceNumber(): Promise<string> {
  const year = Number(jakartaTodayDateIso().slice(0, 4))
  const prefix = `INV/${year}/`

  const count = await prisma.invoice.count({ where: { invoiceNumber: { startsWith: prefix } } })
  const next = String(count + 1).padStart(5, "0")
  return `${prefix}${next}`
}
