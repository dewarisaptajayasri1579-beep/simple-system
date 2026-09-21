import { prisma } from "@/lib/prisma"
import { advanceRenewalDates } from "@/lib/accounting/mark-paid"
import { findStaleCostLinkedInvoices, type StaleCostLinkedInvoice } from "@/lib/data-consistency-check"

/** Perbaikan otomatis untuk temuan "Cost-link kemungkinan belum ke-sync" (lihat
 *  data-consistency-check.ts & Konsistensi-Data.md §3) — staf lupa pilih cost-link
 *  Domain/Server/Maintenance saat input Pembayaran, jadi lastPaidAt/expiryDate item itu tidak
 *  pernah maju walau invoice-nya sudah lunas.
 *
 *  Dipicu dari 2 jalur:
 *  - Tombol "Sinkronkan" per-temuan di /pengaturan/cek-konsistensi-data (Owner klik satu-satu).
 *  - Cron harian (lib/cron/data-consistency-sync.ts) — otomatis, tanpa perlu diklik.
 *
 *  Sengaja REUSE advanceRenewalDates (fungsi yang sama dipakai saat Payment beneran diposting
 *  dengan costLink dipilih) — supaya efeknya PERSIS sama dengan kalau staf memang mencentang
 *  cost-link-nya waktu itu (Domain: expiryDate +1 tahun dari anchor lama, Server: +1 periode,
 *  Maintenance: lastPaidAt saja), bukan logika terpisah yang bisa ketinggalan kalau
 *  advanceRenewalDates berubah nanti. */

export interface CostLinkSyncResult {
  invoiceNumber: string
  itemType: "domain" | "server" | "maintenance"
  itemName: string
  previousLastPaidAt: string | null
  newPaidAt: string
  removedPhantomCycles: number
}

/** Ambil tanggal pembayaran yang SEBENARNYA (bukan tanggal invoice terbit) — basis yang sama
 *  dengan lastPaidAt kalau cost-link-nya dipilih dengan benar waktu itu. Kalau invoice ini
 *  dicicil beberapa kali (jarang untuk item cost-link, tapi jaga-jaga), pakai pembayaran
 *  TERAKHIR — itu yang paling mencerminkan "kapan beneran lunas". */
async function latestPaymentDate(invoiceId: string): Promise<Date | null> {
  const payments = await prisma.invoicePayment.findMany({
    where: { invoiceId, OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] },
    select: { paidAt: true },
    orderBy: { paidAt: "desc" },
    take: 1,
  })
  return payments[0]?.paidAt ?? null
}

async function syncOne(stale: StaleCostLinkedInvoice): Promise<CostLinkSyncResult | null> {
  const paidAt = await latestPaymentDate(stale.invoiceId)
  if (!paidAt) return null // invoice "paid" tapi tidak ada InvoicePayment posted — di luar cakupan, jangan dipaksa

  return prisma.$transaction(async (tx) => {
    await advanceRenewalDates(tx, { refType: stale.costLinkType, refId: stale.costLinkId, paidAt })

    // Siklus SLA "hantu" — begitu item ini kelihatan jatuh tempo lagi gara-gara lastPaidAt yang
    // stale, ensureBillingFollowUps otomatis membuka siklus baru (dueAppearedAt = saat itu,
    // invoicedAt masih null karena belum sempat ditagih ulang). Begitu lastPaidAt dibetulkan,
    // siklus itu jadi tidak nyata — HANYA yang benar-benar tanpa invoice (invoicedAt null) yang
    // dihapus, siklus yang sudah beneran ditagih invoice lain dibiarkan (bukan tanggung jawab
    // sync ini). Sama persis dengan investigasi manual kasus Naba (2026-09-21).
    const removed = await tx.billingFollowUp.deleteMany({
      where: { refType: stale.costLinkType, refId: stale.costLinkId, paidRecordedAt: null, invoicedAt: null },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: "cost_link_sync",
        entityType: stale.costLinkType,
        entityId: stale.costLinkId,
        metadataJson: {
          invoiceNumber: stale.invoiceNumber,
          itemName: stale.itemName,
          previousLastPaidAt: stale.itemLastPaidAt?.toISOString() ?? null,
          newPaidAt: paidAt.toISOString(),
          removedPhantomCycles: removed.count,
        },
      },
    })

    return {
      invoiceNumber: stale.invoiceNumber,
      itemType: stale.costLinkType,
      itemName: stale.itemName,
      previousLastPaidAt: stale.itemLastPaidAt?.toISOString() ?? null,
      newPaidAt: paidAt.toISOString(),
      removedPhantomCycles: removed.count,
    }
  })
}

/** Sinkronkan 1 invoice tertentu — dipanggil tombol "Sinkronkan" (Owner klik, konfirmasi
 *  eksplisit per temuan). Re-derive ulang dari database (tidak percaya begitu saja parameter
 *  dari client) supaya tidak ke-sync 2x atau ke-sync invoice yang ternyata sudah tidak stale. */
export async function syncCostLinkedInvoice(invoiceId: string): Promise<CostLinkSyncResult> {
  const staleList = await findStaleCostLinkedInvoices()
  const target = staleList.find((s) => s.invoiceId === invoiceId)
  if (!target) throw new Error("Invoice ini tidak (lagi) terdeteksi sebagai cost-link yang belum sinkron")

  const result = await syncOne(target)
  if (!result) throw new Error("Tidak ada pembayaran posted untuk invoice ini — tidak ada tanggal yang bisa disinkronkan")
  return result
}

/** Sinkronkan SEMUA temuan cost-link yang stale sekaligus — dipakai cron harian (tanpa
 *  interaksi manusia, lihat lib/cron/data-consistency-sync.ts). Item yang gagal 1 tidak
 *  menggagalkan yang lain (masing-masing transaksi sendiri-sendiri). */
export async function syncAllStaleCostLinks(): Promise<{ synced: CostLinkSyncResult[]; failed: { invoiceNumber: string; error: string }[] }> {
  const staleList = await findStaleCostLinkedInvoices()
  const synced: CostLinkSyncResult[] = []
  const failed: { invoiceNumber: string; error: string }[] = []

  for (const stale of staleList) {
    try {
      const result = await syncOne(stale)
      if (result) synced.push(result)
    } catch (error) {
      failed.push({ invoiceNumber: stale.invoiceNumber, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return { synced, failed }
}
