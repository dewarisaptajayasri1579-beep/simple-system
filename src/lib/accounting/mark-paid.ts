import type { TxClient } from "./post-journal"
import { postJournalEntry } from "./post-journal"
import { billPaidLines } from "./journal-rules"
import { getAccountCoaCode } from "./coa-lookup"
import { COA_CODE } from "./coa-seed"

/** Dipakai bareng oleh kartu "Bayar Server" (Keuangan) DAN dari baris Biaya di Pelunasan
 *  saat staf mengaitkan biaya ke server tertentu — supaya satu-satunya jalur pencatatan
 *  "server sudah dibayar" cuma di sini, nggak dobel logic di dua tempat. */
export async function markServerPaid(
  tx: TxClient,
  input: { serverId: string; accountId: string; paidAt: Date; createdBy: string }
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

  const updated = await tx.server.update({
    where: { id: input.serverId },
    data: { lastPaidAt: input.paidAt, lastCheckinAt: null },
  })

  return { transaction, server: updated }
}

/** Padanan markServerPaid buat Domain — dipakai kartu "Bayar Domain" (Keuangan) dan baris
 *  Biaya di Pelunasan saat dikaitkan ke domain tertentu. */
export async function markDomainPaid(
  tx: TxClient,
  input: { domainId: string; accountId: string; paidAt: Date; createdBy: string }
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

  const updated = await tx.domain.update({
    where: { id: input.domainId },
    data: { lastPaidAt: input.paidAt },
  })

  return { transaction, domain: updated }
}
