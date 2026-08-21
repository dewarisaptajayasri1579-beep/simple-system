/**
 * Perbaikan sekali-jalan: JE-2026-000060 ("Saldo awal akun BCA OPERASIONAL", Rp3.923.667) salah
 * input — dikonfirmasi owner via chat. Dibatalkan (void, bukan delete — jejak audit tetap ada,
 * mirror pola voidJournalEntryBySource yang dipakai PATCH /api/accounts/[id] saat Saldo Awal
 * diubah) + Account.openingBalance BCA OPERASIONAL direset ke 0, supaya keduanya tetap sinkron
 * sama seperti kalau staf edit Saldo Awal jadi 0 lewat UI Master Data > Akun Kas & Bank.
 *
 * Aman dijalankan ulang: no-op kalau JE-nya sudah voided sebelumnya.
 * Jalankan: npx tsx scripts/void-wrong-bca-operasional-opening-balance.ts
 */
import { prisma } from "../src/lib/prisma"
import { voidJournalEntryBySource } from "../src/lib/accounting/post-journal"

const ACCOUNT_ID = "b33ad521-78e6-4d1b-ac4f-b0ffccb9a856" // BCA OPERASIONAL
const VOIDED_BY_ID = "00751cd9-aeb5-45e1-8bca-1dbe08d1cd75" // Ony — yang minta pembatalan ini
const VOID_REASON = "Salah input saldo awal (dikonfirmasi owner via chat)"

async function main() {
  const account = await prisma.account.findUnique({ where: { id: ACCOUNT_ID } })
  if (!account) throw new Error(`Account ${ACCOUNT_ID} tidak ditemukan`)

  await prisma.$transaction(async (tx) => {
    const voided = await voidJournalEntryBySource(tx, {
      sourceType: "account_opening_balance",
      sourceId: ACCOUNT_ID,
      voidedById: VOIDED_BY_ID,
      voidReason: VOID_REASON,
    })
    if (voided) {
      console.log(`[void] Jurnal saldo awal ${voided.entryNumber} untuk ${account.name} dibatalkan.`)
    } else {
      console.log(`[void] Tidak ada jurnal saldo awal posted untuk ${account.name} (sudah dibatalkan sebelumnya?), skip.`)
    }

    await tx.account.update({ where: { id: ACCOUNT_ID }, data: { openingBalance: 0 } })
    console.log(`[update] Account.openingBalance ${account.name} direset ke 0.`)
  })
}

main()
  .catch((e) => {
    console.error("[void] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
