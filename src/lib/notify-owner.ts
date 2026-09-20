import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/wahub"

/** Notifikasi ke Owner untuk hal-hal yang dia sendiri tidak input tapi wajib dia cek.
 *
 *  Kenapa WhatsApp: jalur yang sama dengan reminder biaya berkala & follow-up piutang (lihat
 *  lib/cron/*) — langsung masuk HP, tidak perlu Owner buka aplikasi dulu. Tiap kiriman juga
 *  ditulis ke AuditLog supaya tetap ada jejaknya kalau WAHUB lagi mati saat kejadian.
 *
 *  SELALU dipanggil best-effort (fire & forget setelah data tersimpan) — gagal kirim WA TIDAK
 *  boleh menggagalkan transaksi yang sudah benar tercatat di database.
 */

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

function formatJakartaDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

export interface BankPaymentNotification {
  paymentId: string
  paymentNumber: string
  clientName: string
  /** Nominal kas riil (IDR) yang masuk — Payment.totalAmount. */
  totalAmount: number
  accountName: string
  accountBankName: string | null
  accountNumber: string | null
  invoiceNumbers: string[]
  paidAt: Date
  inputByName: string
  inputByRole: string
}

/** Dipanggil dari POST /api/payments saat staf (bukan Owner sendiri) mencatat pelunasan client
 *  ke akun bertipe "bank" — Owner perlu tahu saat itu juga supaya bisa cocokkan ke mutasi
 *  rekening sebelum pembayarannya diposting. */
export async function notifyOwnerBankPayment(input: BankPaymentNotification) {
  const rekening = [input.accountBankName, input.accountNumber].filter(Boolean).join(" • ")
  const message = [
    "🔔 *Pembayaran masuk ke Bank*",
    "",
    `Kwitansi: *${input.paymentNumber}*`,
    `Client: ${input.clientName}`,
    `Nominal: *${formatRupiah(input.totalAmount)}*`,
    `Rekening: ${input.accountName}${rekening ? ` (${rekening})` : ""}`,
    input.invoiceNumbers.length > 0 ? `Invoice: ${input.invoiceNumbers.join(", ")}` : null,
    `Tanggal bayar: ${formatJakartaDate(input.paidAt)}`,
    `Diinput oleh: ${input.inputByName} (${input.inputByRole})`,
    "",
    "Masih *DRAFT* — cek mutasi rekeningnya, lalu posting di menu Pembayaran.",
  ]
    .filter(Boolean)
    .join("\n")

  // Owner aktif yang punya nomor HP. Sengaja findMany (bukan findFirst) — kalau nanti ada lebih
  // dari satu owner, semuanya ikut dikabari.
  const owners = await prisma.user.findMany({
    where: { role: "owner", isActive: true, phoneNumber: { not: null } },
    select: { id: true, name: true, phoneNumber: true },
  })

  const sentTo: string[] = []
  const failedTo: string[] = []
  for (const owner of owners) {
    try {
      await sendWhatsappMessage(owner.phoneNumber!, message)
      sentTo.push(owner.name)
    } catch (error) {
      failedTo.push(owner.name)
      console.error(`[notify-owner] Gagal kirim WA pembayaran bank ke ${owner.name}:`, error)
    }
  }

  // Jejak permanen — dipakai kalau Owner merasa tidak pernah dapat WA-nya (WAHUB mati, nomor
  // kosong, dst). Baris ini tetap ditulis walau tidak ada owner yang bisa dikirimi.
  await prisma.auditLog.create({
    data: {
      actorUserId: null,
      action: "notify_owner_bank_payment",
      entityType: "payment",
      entityId: input.paymentId,
      metadataJson: {
        paymentNumber: input.paymentNumber,
        clientName: input.clientName,
        totalAmount: input.totalAmount,
        accountName: input.accountName,
        invoiceNumbers: input.invoiceNumbers,
        inputByName: input.inputByName,
        inputByRole: input.inputByRole,
        sentTo,
        failedTo,
        ownersWithoutPhone: owners.length === 0,
      },
    },
  })
}
