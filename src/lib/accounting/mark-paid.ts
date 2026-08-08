import type { TxClient } from "./post-journal"
import { postJournalEntry, postJournalEntryFinal } from "./post-journal"
import { billPaidLines } from "./journal-rules"
import { getAccountCoaCode } from "./coa-lookup"
import { COA_CODE } from "./coa-seed"

/** Dipakai bareng oleh kartu "Bayar Server" (Keuangan) DAN dari baris Biaya di Pelunasan
 *  saat staf mengaitkan biaya ke server tertentu — supaya satu-satunya jalur pencatatan
 *  "server sudah dibayar" cuma di sini, nggak dobel logic di dua tempat.
 *
 *  Draft -> Posted: cuma bikin Transaction + jurnal draft di sini. `lastPaidAt` BELUM
 *  diupdate — baru diupdate saat draft ini di-posting (lihat finalizeTransactionPosting). */
export async function markServerPaid(
  tx: TxClient,
  input: { serverId: string; accountId: string; paidAt: Date; createdBy: string; paymentId?: string }
) {
  const server = await tx.server.findUnique({ where: { id: input.serverId } })
  if (!server) throw new Error("Server tidak ditemukan")
  if (!server.price || server.price <= 0) throw new Error("Server ini belum punya nominal")

  const transaction = await tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "expense",
      grossAmount: server.price,
      cost: 0,
      netAmount: server.price,
      description: `Pembayaran server - ${server.name}`,
      occurredAt: input.paidAt,
      refType: "server",
      refId: server.id,
      paymentId: input.paymentId ?? null,
    },
  })

  const kasBankCoaCode = await getAccountCoaCode(tx, input.accountId)
  await postJournalEntry(tx, {
    date: input.paidAt,
    description: `Pembayaran server - ${server.name}`,
    sourceType: "server",
    sourceId: server.id,
    createdBy: input.createdBy,
    lines: billPaidLines({ kasBankCoaCode, expenseCoaCode: COA_CODE.bebanServerHosting, amount: server.price }),
  })

  return { transaction, server }
}

/** Padanan markServerPaid buat Domain — dipakai kartu "Bayar Domain" (Keuangan) dan baris
 *  Biaya di Pelunasan saat dikaitkan ke domain tertentu. Draft -> Posted sama seperti di atas. */
export async function markDomainPaid(
  tx: TxClient,
  input: { domainId: string; accountId: string; paidAt: Date; createdBy: string; paymentId?: string }
) {
  const domain = await tx.domain.findUnique({ where: { id: input.domainId } })
  if (!domain) throw new Error("Domain tidak ditemukan")
  if (!domain.sellPrice || domain.sellPrice <= 0) throw new Error("Domain ini belum punya nominal")

  const transaction = await tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "expense",
      grossAmount: domain.sellPrice,
      cost: 0,
      netAmount: domain.sellPrice,
      description: `Pembayaran domain - ${domain.name}`,
      occurredAt: input.paidAt,
      refType: "domain",
      refId: domain.id,
      paymentId: input.paymentId ?? null,
    },
  })

  const kasBankCoaCode = await getAccountCoaCode(tx, input.accountId)
  await postJournalEntry(tx, {
    date: input.paidAt,
    description: `Pembayaran domain - ${domain.name}`,
    sourceType: "domain",
    sourceId: domain.id,
    createdBy: input.createdBy,
    lines: billPaidLines({ kasBankCoaCode, expenseCoaCode: COA_CODE.bebanDomain, amount: domain.sellPrice }),
  })

  return { transaction, domain }
}

/** Posting 1 Transaction draft (manual Keuangan, atau hasil markServerPaid/markDomainPaid/
 *  recurring-bill mark-paid) — flip Transaction + jurnal terkait jadi posted, baru di titik
 *  ini efeknya berlaku: saldo akun ikut terhitung (lewat filter postStatus di
 *  computeAccountBalance), dan kalau ada refType/refId, `lastPaidAt` Server/Domain/
 *  RecurringBill terkait baru diupdate sekarang. Dipanggil dari POST /api/transactions/[id]/post
 *  dan dari posting Payment yang membawa costLink Domain/Server. */
export async function finalizeTransactionPosting(tx: TxClient, input: { transactionId: string; postedById: string }) {
  const transaction = await tx.transaction.findUnique({ where: { id: input.transactionId } })
  if (!transaction) throw new Error("Transaksi tidak ditemukan")
  if (transaction.postStatus === "posted") return transaction

  const sourceType = (transaction.refType ?? "transaction") as "transaction" | "server" | "domain" | "recurring_bill"
  const sourceId = transaction.refType && transaction.refId ? transaction.refId : transaction.id

  await postJournalEntryFinal(tx, { sourceType, sourceId, postedById: input.postedById })

  if (transaction.refType === "server" && transaction.refId) {
    await tx.server.update({ where: { id: transaction.refId }, data: { lastPaidAt: transaction.occurredAt, lastCheckinAt: null } })
  } else if (transaction.refType === "domain" && transaction.refId) {
    await tx.domain.update({ where: { id: transaction.refId }, data: { lastPaidAt: transaction.occurredAt } })
  } else if (transaction.refType === "recurring_bill" && transaction.refId) {
    await tx.recurringBill.update({ where: { id: transaction.refId }, data: { lastPaidAt: transaction.occurredAt, lastCheckinAt: null } })
  }

  return tx.transaction.update({
    where: { id: input.transactionId },
    data: { postStatus: "posted", postedAt: new Date(), postedById: input.postedById },
  })
}
