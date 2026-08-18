import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/wahub"
import { invoiceCashDue } from "@/lib/invoice-due"

const FOLLOWUP_COOLDOWN_DAYS = 3

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

/** Follow-up tagihan proaktif ke Client via WA — cuma jalan kalau Settings.aiFollowUpEnabled
 *  di-ON-kan lewat Pengaturan. Klaim lastFollowUpAt secara atomic per invoice supaya tidak
 *  dobel kirim kalau cron overlap. */
export async function runReceivableFollowups() {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } })
  if (!settings?.aiFollowUpEnabled) return

  const now = new Date()
  const cooldownThreshold = new Date(now.getTime() - FOLLOWUP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["unpaid", "partial"] },
      dueDate: { lt: now },
      client: { phoneNumber: { not: null } },
      postStatus: "posted",
    },
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
  })

  const due = invoices.filter((inv) => !inv.lastFollowUpAt || inv.lastFollowUpAt < cooldownThreshold)

  for (const invoice of due) {
    const claim = await prisma.invoice.updateMany({
      where: { id: invoice.id, OR: [{ lastFollowUpAt: null }, { lastFollowUpAt: { lt: cooldownThreshold } }] },
      data: { lastFollowUpAt: now },
    })
    if (claim.count === 0) continue

    const remaining = invoiceCashDue(invoice, invoice.client.isPemungutPpn) - invoice.payments.reduce((s, p) => s + p.amount, 0)
    const message = [
      `Halo ${invoice.client.name},`,
      "",
      `Ini pengingat untuk invoice ${invoice.invoiceNumber} sejumlah ${formatRupiah(remaining)} yang sudah jatuh tempo.`,
      "",
      `Kalau sudah transfer, balas chat ini ya biar kami cek & konfirmasi. Terima kasih!`,
    ].join("\n")

    try {
      await sendWhatsappMessage(invoice.client.phoneNumber!, message)
    } catch (error) {
      console.error(`[cron] Gagal follow-up invoice ${invoice.invoiceNumber}:`, error)
    }
  }
}
