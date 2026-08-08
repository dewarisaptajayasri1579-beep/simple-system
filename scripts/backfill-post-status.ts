/**
 * Migrasi sekali-jalan: dijalankan tepat setelah kolom `postStatus` (default "draft")
 * ditambahkan ke Invoice/Payment/Transaction/JournalEntry untuk fitur Draft->Posting.
 * Semua baris yang SUDAH ADA sebelum fitur ini dirilis diset jadi "posted" (postedAt =
 * createdAt) supaya histori (Dashboard Piutang, saldo akun, laporan) tidak mendadak hilang
 * begitu query mulai difilter `postStatus: "posted"`.
 *
 * Aman dijalankan ulang (idempotent — cuma menyentuh baris yang masih "draft").
 *
 * Jalankan: npx tsx scripts/backfill-post-status.ts
 */
import { prisma } from "../src/lib/prisma"

async function main() {
  const invoices = await prisma.$executeRaw`
    UPDATE simple_system.invoices SET post_status = 'posted', posted_at = created_at
    WHERE post_status = 'draft'
  `
  const payments = await prisma.$executeRaw`
    UPDATE simple_system.payments SET post_status = 'posted', posted_at = created_at
    WHERE post_status = 'draft'
  `
  const transactions = await prisma.$executeRaw`
    UPDATE simple_system.transactions SET post_status = 'posted', posted_at = created_at
    WHERE post_status = 'draft'
  `
  const journalEntries = await prisma.$executeRaw`
    UPDATE simple_system.journal_entries SET post_status = 'posted', posted_at = created_at
    WHERE post_status = 'draft'
  `

  console.log(
    `[backfill-post-status] Selesai. invoices=${invoices}, payments=${payments}, transactions=${transactions}, journalEntries=${journalEntries}`
  )
}

main()
  .catch((e) => {
    console.error("[backfill-post-status] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
