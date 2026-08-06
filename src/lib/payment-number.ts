import { prisma } from "@/lib/prisma"
import { jakartaTodayDateIso } from "@/lib/datetime"

/** Format: PMT/{tahun}/{5 digit berurut, reset tiap tahun}. Dipanggil di dalam transaksi
 *  create Payment (lihat app/api/payments/route.ts) supaya urut & tidak bentrok. */
export async function generatePaymentNumber(): Promise<string> {
  const year = Number(jakartaTodayDateIso().slice(0, 4))
  const prefix = `PMT/${year}/`

  const count = await prisma.payment.count({ where: { paymentNumber: { startsWith: prefix } } })
  const next = String(count + 1).padStart(5, "0")
  return `${prefix}${next}`
}
