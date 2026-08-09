import type { TxClient } from "./post-journal"
import { postJournalEntry, postJournalEntryFinal, finalizeJournalEntryById } from "./post-journal"
import { billPaidLines } from "./journal-rules"
import { getAccountCoaCode } from "./coa-lookup"
import { COA_CODE } from "./coa-seed"
import { computeDomainExpiryDate } from "@/lib/domain-status"

/** Dipakai bareng oleh kartu "Bayar Server" (Keuangan) DAN dari baris Biaya di Pelunasan
 *  saat staf mengaitkan biaya ke server tertentu — supaya satu-satunya jalur pencatatan
 *  "server sudah dibayar" cuma di sini, nggak dobel logic di dua tempat.
 *
 *  Draft -> Posted: cuma bikin Transaction + jurnal draft di sini. `lastPaidAt` BELUM
 *  diupdate — baru diupdate saat draft ini di-posting (lihat finalizeTransactionPosting). */
export async function markServerPaid(
  tx: TxClient,
  input: { serverId: string; accountId: string; amount: number; paidAt: Date; createdBy: string; paymentId?: string }
) {
  const server = await tx.server.findUnique({ where: { id: input.serverId } })
  if (!server) throw new Error("Server tidak ditemukan")
  if (!input.amount || input.amount <= 0) throw new Error("Biaya (HPP) server ini wajib diisi")

  const transaction = await tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "expense",
      grossAmount: input.amount,
      cost: 0,
      netAmount: input.amount,
      description: `Pembayaran server - ${server.name}`,
      occurredAt: input.paidAt,
      refType: "server",
      refId: server.id,
      paymentId: input.paymentId ?? null,
    },
  })

  const kasBankCoaCode = await getAccountCoaCode(tx, input.accountId)
  const journalEntry = await postJournalEntry(tx, {
    date: input.paidAt,
    description: `Pembayaran server - ${server.name}`,
    sourceType: "server",
    sourceId: server.id,
    createdBy: input.createdBy,
    lines: billPaidLines({ kasBankCoaCode, expenseCoaCode: COA_CODE.bebanServerHosting, amount: input.amount }),
  })
  // Simpan link presisi ke jurnal BARU ini (bukan cuma sourceType+sourceId, yang dipakai bareng
  // sama semua histori pembayaran server yang sama) — supaya "Lihat Jurnal" utk transaksi INI
  // saja, tidak ikut kebawa jurnal pembayaran lama/dibatalkan buat server yang sama.
  await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

  return { transaction, server }
}

/** Padanan markServerPaid buat Domain — dipakai kartu "Bayar Domain" (Keuangan) dan baris
 *  Biaya di Pelunasan saat dikaitkan ke domain tertentu. Draft -> Posted sama seperti di atas. */
export async function markDomainPaid(
  tx: TxClient,
  input: { domainId: string; accountId: string; amount: number; paidAt: Date; createdBy: string; paymentId?: string }
) {
  const domain = await tx.domain.findUnique({ where: { id: input.domainId } })
  if (!domain) throw new Error("Domain tidak ditemukan")
  if (!input.amount || input.amount <= 0) throw new Error("Biaya (HPP) domain ini wajib diisi")

  const transaction = await tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "expense",
      grossAmount: input.amount,
      cost: 0,
      netAmount: input.amount,
      description: `Pembayaran domain - ${domain.name}`,
      occurredAt: input.paidAt,
      refType: "domain",
      refId: domain.id,
      paymentId: input.paymentId ?? null,
    },
  })

  const kasBankCoaCode = await getAccountCoaCode(tx, input.accountId)
  const journalEntry = await postJournalEntry(tx, {
    date: input.paidAt,
    description: `Pembayaran domain - ${domain.name}`,
    sourceType: "domain",
    sourceId: domain.id,
    createdBy: input.createdBy,
    lines: billPaidLines({ kasBankCoaCode, expenseCoaCode: COA_CODE.bebanDomain, amount: input.amount }),
  })
  // Sama seperti markServerPaid — link presisi supaya "Lihat Jurnal" tidak kebawa histori
  // pembayaran domain yang sama dari payment lain/lama.
  await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

  return { transaction, domain }
}

/** Padanan markServerPaid buat Maintenance — dipakai kartu "Bayar Maintenance" (Keuangan) dan
 *  baris Biaya di Pelunasan saat dikaitkan ke maintenance tertentu. Draft -> Posted sama
 *  seperti markServerPaid/markDomainPaid. */
export async function markMaintenancePaid(
  tx: TxClient,
  input: { maintenanceId: string; accountId: string; amount: number; paidAt: Date; createdBy: string; paymentId?: string }
) {
  const maintenance = await tx.maintenance.findUnique({ where: { id: input.maintenanceId } })
  if (!maintenance) throw new Error("Maintenance tidak ditemukan")
  if (!input.amount || input.amount <= 0) throw new Error("Biaya (HPP) maintenance ini wajib diisi")

  const transaction = await tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "expense",
      grossAmount: input.amount,
      cost: 0,
      netAmount: input.amount,
      description: `Pembayaran maintenance - ${maintenance.name}`,
      occurredAt: input.paidAt,
      refType: "maintenance",
      refId: maintenance.id,
      paymentId: input.paymentId ?? null,
    },
  })

  const kasBankCoaCode = await getAccountCoaCode(tx, input.accountId)
  const journalEntry = await postJournalEntry(tx, {
    date: input.paidAt,
    description: `Pembayaran maintenance - ${maintenance.name}`,
    sourceType: "maintenance",
    sourceId: maintenance.id,
    createdBy: input.createdBy,
    lines: billPaidLines({ kasBankCoaCode, expenseCoaCode: COA_CODE.bebanMaintenance, amount: input.amount }),
  })
  await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

  return { transaction, maintenance }
}

/** Posting 1 Transaction draft (manual Keuangan, atau hasil markServerPaid/markDomainPaid/
 *  recurring-bill mark-paid) — flip Transaction + jurnal terkait jadi posted, baru di titik
 *  ini efeknya berlaku: saldo akun ikut terhitung (lewat filter postStatus di
 *  computeAccountBalance), dan kalau ada refType/refId, `lastPaidAt` Server/Domain/
 *  RecurringBill terkait baru diupdate sekarang. Dipanggil dari POST /api/transactions/[id]/post
 *  dan dari posting Payment yang membawa costLink Domain/Server. */
export async function finalizeTransactionPosting(tx: TxClient, input: { transactionId: string; postedById: string }) {
  const transaction = await tx.transaction.findUnique({ where: { id: input.transactionId }, include: { invoicePayment: true } })
  if (!transaction) throw new Error("Transaksi tidak ditemukan")
  if (transaction.postStatus === "posted") return transaction

  // journalEntryId = link presisi ke jurnal transaksi INI (selalu diisi sejak dibuat — lihat
  // markServerPaid/markDomainPaid/payments/route.ts/recurring-bills mark-paid). Fallback
  // sourceType+sourceId cuma untuk baris lama sebelum kolom ini ada — sengaja dibedakan
  // "invoice_payment" (kalau transaksi ini baris Pembayaran) dari "transaction" biasa, supaya
  // tidak salah tebak dan gagal nemu jurnalnya (itu penyebab bug jurnal "nyangkut" draft).
  let posted
  if (transaction.journalEntryId) {
    posted = await finalizeJournalEntryById(tx, transaction.journalEntryId, input.postedById)
  } else {
    const sourceType = transaction.refType ?? (transaction.paymentId || transaction.invoicePayment ? "invoice_payment" : "transaction")
    const sourceId = transaction.refType && transaction.refId ? transaction.refId : transaction.id
    posted = await postJournalEntryFinal(tx, { sourceType: sourceType as never, sourceId, postedById: input.postedById })
  }
  if (!posted) {
    throw new Error(`Jurnal untuk transaksi "${transaction.description ?? transaction.id}" tidak ketemu — tidak bisa diposting`)
  }

  if (transaction.refType === "server" && transaction.refId) {
    await tx.server.update({ where: { id: transaction.refId }, data: { lastPaidAt: transaction.occurredAt, lastCheckinAt: null } })
  } else if (transaction.refType === "domain" && transaction.refId) {
    // Perpanjangan domain menyambung dari jatuh tempo SEBELUMNYA + 1 tahun, bukan dari tanggal
    // bayar — supaya telat bayar tidak menggeser siklus jatuh tempo tahun depan. Kalau ini
    // pembayaran pertama (belum pernah ada lastPaidAt), baru dari tanggal bayar/aktivasi.
    const domain = await tx.domain.findUnique({ where: { id: transaction.refId }, select: { lastPaidAt: true } })
    const previousDueDate = computeDomainExpiryDate(domain?.lastPaidAt ?? null)
    await tx.domain.update({ where: { id: transaction.refId }, data: { lastPaidAt: previousDueDate ?? transaction.occurredAt } })
  } else if (transaction.refType === "recurring_bill" && transaction.refId) {
    await tx.recurringBill.update({ where: { id: transaction.refId }, data: { lastPaidAt: transaction.occurredAt, lastCheckinAt: null } })
  } else if (transaction.refType === "maintenance" && transaction.refId) {
    await tx.maintenance.update({ where: { id: transaction.refId }, data: { lastPaidAt: transaction.occurredAt } })
  }

  return tx.transaction.update({
    where: { id: input.transactionId },
    data: { postStatus: "posted", postedAt: new Date(), postedById: input.postedById },
  })
}
