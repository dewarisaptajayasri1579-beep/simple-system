import type { Prisma } from "@prisma/client"
import type { TxClient } from "./post-journal"

/** Log Aktivitas Transaction (Kas Masuk/Keluar) — dibuat/direvisi/diposting/dibatalkan, siapa
 *  & kapan. Pakai model `AuditLog` yang sudah ada (entityType "transaction"), BUKAN cuma
 *  createdBy/postedBy/voidedBy di kolom Transaction sendiri — itu cuma nyimpan aktor TERAKHIR
 *  per aksi, tidak bisa nunjukin histori edit (revisi) berkali-kali. Ditulis lewat `tx` yang
 *  sama dengan transaksi Prisma pemanggilnya supaya atomic (kalau transaksinya rollback, log
 *  ini ikut batal, tidak nyangkut "yatim"). */
export async function logTransactionEvent(
  tx: TxClient,
  input: {
    transactionId: string
    action: "created" | "updated" | "posted" | "voided"
    actorUserId: string | null
    before?: unknown
    after?: unknown
    metadata?: Record<string, unknown>
  }
) {
  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "transaction",
      entityId: input.transactionId,
      beforeJson: input.before as Prisma.InputJsonValue | undefined,
      afterJson: input.after as Prisma.InputJsonValue | undefined,
      metadataJson: input.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}
