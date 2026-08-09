import { prisma } from "@/lib/prisma"
import { jakartaRangeFromToday } from "@/lib/datetime"
import { generateTerminInvoice } from "@/lib/project-termin"

/** Cek termin project yang jatuh tempo (dueDate) tepat 3 hari lagi (H-3) dan belum punya
 *  invoice, lalu auto-generate invoice-nya. Filter `invoiceId: null` di query sekaligus jadi
 *  penjaga idempotensi terhadap generateTerminInvoice sendiri — dipanggil ulang besok pun
 *  termin yang sudah ke-generate hari ini tidak lolos filter lagi. */
export async function runProjectTerminInvoicing() {
  const targetDayStart = jakartaRangeFromToday(3).end // awal hari "hari ini + 3"
  const targetDayEnd = jakartaRangeFromToday(4).end // akhir hari "hari ini + 3"

  const due = await prisma.projectPaymentSchedule.findMany({
    where: {
      invoiceId: null,
      dueDate: { gte: targetDayStart, lt: targetDayEnd },
      project: { status: "berjalan" },
    },
  })

  for (const schedule of due) {
    await prisma.$transaction((tx) => generateTerminInvoice(tx, { scheduleId: schedule.id, createdBy: null })).catch((e) =>
      console.error(`[cron] gagal generate invoice termin ${schedule.id}:`, e)
    )
  }
}
