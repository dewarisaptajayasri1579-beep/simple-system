import type { TxClient } from "./post-journal"
import { postJournalEntry, postJournalEntryFinal, finalizeJournalEntryById } from "./post-journal"
import { billPaidLines, payrollPaidLines } from "./journal-rules"
import { getAccountCoaCode } from "./coa-lookup"
import { COA_CODE, bebanCodeForCategory } from "./coa-seed"
import { computeDomainExpiryDate } from "@/lib/domain-status"
import { computeNextDueDate } from "@/lib/recurring-bill-status"
import { generateTransactionNumber } from "@/lib/transaction-number"
import { logTransactionEvent } from "./transaction-audit"

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
      transactionNumber: await generateTransactionNumber(tx, "expense"),
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
      createdById: input.createdBy,
    },
  })
  await logTransactionEvent(tx, { transactionId: transaction.id, action: "created", actorUserId: input.createdBy, metadata: { via: "Bayar Server" } })

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
      transactionNumber: await generateTransactionNumber(tx, "expense"),
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
      createdById: input.createdBy,
    },
  })
  await logTransactionEvent(tx, { transactionId: transaction.id, action: "created", actorUserId: input.createdBy, metadata: { via: "Bayar Domain" } })

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
      transactionNumber: await generateTransactionNumber(tx, "expense"),
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
      createdById: input.createdBy,
    },
  })
  await logTransactionEvent(tx, { transactionId: transaction.id, action: "created", actorUserId: input.createdBy, metadata: { via: "Bayar Maintenance" } })

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

/** Padanan markServerPaid buat Biaya Berkala (RecurringBill) — dipakai tombol "Bayar Sekarang"
 *  di Dashboard maupun baris "Bayar Biaya Berkala" di Kas Keluar, supaya satu-satunya jalur
 *  pencatatan "biaya berkala sudah dibayar" cuma di sini. `categoryId` di sini cuma label
 *  tampilan di riwayat Kas Keluar — akun Beban jurnalnya tetap ikut `bill.category`
 *  ("kantor"/"pribadi"/"lainnya"), bukan Category yang dipilih. */
export async function markRecurringBillPaid(
  tx: TxClient,
  input: { billId: string; accountId: string; amount: number; paidAt: Date; createdBy: string; categoryId?: string | null; paymentId?: string }
) {
  const bill = await tx.recurringBill.findUnique({ where: { id: input.billId } })
  if (!bill) throw new Error("Biaya berkala tidak ditemukan")
  if (!input.amount || input.amount <= 0) throw new Error("Nominal biaya berkala ini wajib diisi")

  const transaction = await tx.transaction.create({
    data: {
      transactionNumber: await generateTransactionNumber(tx, "expense"),
      accountId: input.accountId,
      type: "expense",
      categoryId: input.categoryId ?? null,
      grossAmount: input.amount,
      cost: 0,
      netAmount: input.amount,
      description: `Pembayaran biaya berkala - ${bill.name}`,
      occurredAt: input.paidAt,
      refType: "recurring_bill",
      refId: bill.id,
      paymentId: input.paymentId ?? null,
      createdById: input.createdBy,
    },
  })
  await logTransactionEvent(tx, {
    transactionId: transaction.id,
    action: "created",
    actorUserId: input.createdBy,
    metadata: { via: "Bayar Biaya Berkala" },
  })

  const kasBankCoaCode = await getAccountCoaCode(tx, input.accountId)
  const journalEntry = await postJournalEntry(tx, {
    date: input.paidAt,
    description: `Pembayaran biaya berkala - ${bill.name}`,
    sourceType: "recurring_bill",
    sourceId: bill.id,
    createdBy: input.createdBy,
    lines: billPaidLines({ kasBankCoaCode, expenseCoaCode: bebanCodeForCategory(bill.category), amount: input.amount }),
  })
  await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

  return { transaction, bill }
}

export type RenewableRefType = "server" | "domain" | "recurring_bill" | "maintenance"

/**
 * Majukan tanggal perpanjangan Server/Domain/Biaya Berkala/Maintenance setelah dibayar.
 *
 * Dipisah jadi fungsi sendiri karena ada DUA jalur yang harus menghasilkan tanggal yang sama
 * persis: (1) posting transaksi beban "Bayar Domain/Server/..." lewat finalizeTransactionPosting,
 * dan (2) perpanjangan TANPA biaya (lihat markRenewedWithoutCost) — mis. Maintenance yang murni
 * jasa kita sendiri, tidak ada uang keluar ke pihak ketiga sama sekali. Kalau rumus tanggalnya
 * dikembar-dua, cepat atau lambat keduanya drift.
 */
export async function advanceRenewalDates(
  tx: TxClient,
  input: { refType: RenewableRefType; refId: string; paidAt: Date }
) {
  if (input.refType === "server") {
    // expiryDate ("Tgl Berakhir") adalah acuan renewal resmi, sama pola dengan Domain di bawah —
    // begitu dibayar, INI yang dimajukan sesuai siklus periode (bukan lastPaidAt/tanggal bayar),
    // supaya telat bayar tidak menggeser siklus jatuh tempo berikutnya.
    const server = await tx.server.findUnique({ where: { id: input.refId }, include: { period: true } })
    // Server BARU (belum pernah punya expiryDate/lastPaidAt) — computeNextDueDate(null, ...)
    // balikin null, jadi fallback-nya HARUS tetap dianggurin lewat computeNextDueDate lagi
    // (anchor = tanggal bayar ini), bukan dipakai mentah-mentah sebagai expiryDate. Kalau dipakai
    // mentah, expiryDate == lastPaidAt (hari ini) dan langsung ke-anggap "expired" beberapa hari
    // kemudian — bug yang sempat kejadian di Domain (lihat catatan sama di bawah).
    const previousAnchor = server?.expiryDate ?? server?.lastPaidAt ?? input.paidAt
    const nextExpiry = computeNextDueDate(previousAnchor, server?.period?.name, server?.periodCount) ?? input.paidAt
    await tx.server.update({
      where: { id: input.refId },
      data: { lastPaidAt: input.paidAt, expiryDate: nextExpiry, lastCheckinAt: null },
    })
    return
  }
  if (input.refType === "domain") {
    // expiryDate ("Tgl Berakhir") adalah acuan renewal resmi — begitu dibayar, INI yang
    // ditambah 1 tahun (bukan lastPaidAt/tanggal bayar), supaya telat bayar tidak menggeser
    // siklus jatuh tempo tahun depan. Kalau belum pernah kesetel (domain baru), jatuh ke
    // lastPaidAt lama, atau tanggal bayar/aktivasi ini kalau benar-benar baru pertama kali.
    // lastPaidAt sendiri tetap murni "kapan terakhir dibayar" — dua field, dua arti beda.
    const domain = await tx.domain.findUnique({ where: { id: input.refId }, select: { expiryDate: true, lastPaidAt: true } })
    // Domain BARU (belum pernah punya expiryDate/lastPaidAt) — computeDomainExpiryDate(null)
    // balikin null, jadi anchor-nya jatuh ke tanggal bayar ini SUPAYA TETAP DITAMBAH 1 TAHUN lagi
    // (bukan dipakai mentah sebagai expiryDate — itu bikin expiryDate == lastPaidAt hari ini,
    // langsung ke-anggap "expired" beberapa hari kemudian walau baru saja dibayar/didaftarkan).
    const previousAnchor = domain?.expiryDate ?? domain?.lastPaidAt ?? input.paidAt
    const nextExpiry = computeDomainExpiryDate(previousAnchor) ?? input.paidAt
    await tx.domain.update({ where: { id: input.refId }, data: { lastPaidAt: input.paidAt, expiryDate: nextExpiry } })
    return
  }
  if (input.refType === "recurring_bill") {
    await tx.recurringBill.update({ where: { id: input.refId }, data: { lastPaidAt: input.paidAt, lastCheckinAt: null } })
    return
  }
  await tx.maintenance.update({ where: { id: input.refId }, data: { lastPaidAt: input.paidAt } })
}

/**
 * Tandai Domain/Server/Maintenance/Biaya Berkala sudah diperpanjang, TANPA mencatat biaya apa pun.
 *
 * Perlu jalur sendiri karena tidak semua perpanjangan menimbulkan uang keluar: Maintenance itu
 * jasa kita sendiri (tidak ada yang dibayar ke pihak ketiga), dan domain/server pun kadang sudah
 * ikut terbayar di transaksi lain. Dulu satu-satunya cara memajukan tanggalnya adalah lewat
 * markDomainPaid/markServerPaid/markMaintenancePaid yang MEWAJIBKAN nominal > 0 — jadi kalau HPP-
 * nya memang nol, stafnya tidak punya pilihan selain membiarkannya, dan itemnya nyangkut terus di
 * daftar jatuh tempo dashboard walau invoicenya sudah lunas.
 *
 * Sengaja TIDAK membuat Transaction/jurnal: nilainya nol, jadi tidak ada yang perlu dibukukan.
 * Jejaknya ditinggalkan lewat AuditLog di pemanggil.
 */
export async function markRenewedWithoutCost(
  tx: TxClient,
  input: { refType: RenewableRefType; refId: string; paidAt: Date }
) {
  await advanceRenewalDates(tx, input)
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

  // Proteksi: kalau transaksi ini pakai Kategori (Kas Masuk/Keluar manual) yang belum
  // di-mapping ke akun COA, tolak posting-nya — daripada diam-diam jatuh ke "Lain-lain" dan
  // staf tidak sadar salah akun. Draft-nya tetap boleh disimpan (supaya staf tidak kehilangan
  // input), tapi baru bisa diposting setelah kategorinya dihubungkan ke COA dulu (Pengaturan >
  // Master Data > Kategori, atau langsung dari modal "Tambah Kategori" di form Kas Keluar).
  if (transaction.categoryId) {
    const category = await tx.category.findUnique({ where: { id: transaction.categoryId } })
    if (category && !category.coaAccountId) {
      throw new Error(`Kategori "${category.name}" belum terhubung ke akun COA — hubungkan dulu (Pengaturan > Master Data > Kategori) sebelum transaksi ini bisa diposting`)
    }
  }

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

  if (
    transaction.refId &&
    (transaction.refType === "server" ||
      transaction.refType === "domain" ||
      transaction.refType === "recurring_bill" ||
      transaction.refType === "maintenance")
  ) {
    await advanceRenewalDates(tx, { refType: transaction.refType, refId: transaction.refId, paidAt: transaction.occurredAt })
  } else if (transaction.refType === "kasbon" && transaction.refId) {
    // Hitung ulang sisa Kasbon dari SEMUA leg (pencairan expense + pelunasan income) yang sudah
    // posted, termasuk transaction ini sendiri (masih berstatus "draft" di DB di titik ini,
    // baru di-flip "posted" oleh tx.transaction.update di akhir fungsi — makanya nilainya
    // ditambahkan manual, bukan ikut query `otherPosted`).
    const otherPosted = await tx.transaction.findMany({
      where: { refType: "kasbon", refId: transaction.refId, postStatus: "posted", id: { not: transaction.id } },
      select: { type: true, grossAmount: true },
    })
    const signed = (t: { type: string; grossAmount: number }) => (t.type === "expense" ? t.grossAmount : -t.grossAmount)
    const outstanding = signed(transaction) + otherPosted.reduce((s, t) => s + signed(t), 0)
    await tx.kasbon.update({ where: { id: transaction.refId }, data: { status: outstanding <= 0.5 ? "lunas" : "outstanding" } })
  }

  await logTransactionEvent(tx, { transactionId: input.transactionId, action: "posted", actorUserId: input.postedById })

  return tx.transaction.update({
    where: { id: input.transactionId },
    data: { postStatus: "posted", postedAt: new Date(), postedById: input.postedById },
  })
}

/** Bayar 1 PayrollPeriod — bikin 1 Transaction (refType="payroll") + 1 jurnal gabungan
 *  untuk SEMUA PayrollItem periode itu sekaligus (bukan per-karyawan, lihat
 *  payrollPaidLines). Draft -> Posted sama pola dengan markServerPaid dkk: cuma bikin
 *  Transaction + jurnal draft di sini, Owner/Finance posting manual lewat
 *  POST /api/transactions/[id]/post yang sudah ada. PayrollPeriod di-lock ("posted") begitu
 *  fungsi ini dipanggil (BUKAN nunggu Transaction-nya diposting) — supaya PayrollItem tidak
 *  bisa dihitung ulang lagi setelah proses bayar dimulai. */
export async function markPayrollPaid(tx: TxClient, input: { payrollPeriodId: string; accountId: string; paidAt: Date; createdBy: string }) {
  const period = await tx.payrollPeriod.findUnique({ where: { id: input.payrollPeriodId }, include: { items: true } })
  if (!period) throw new Error("Periode gaji tidak ditemukan")
  if (period.status === "posted") throw new Error("Periode gaji ini sudah dibayar")
  if (period.items.length === 0) throw new Error("Periode gaji ini belum punya data karyawan — hitung dulu")

  const totalGross = period.items.reduce((s, i) => s + i.grossPay, 0)
  const totalKasbon = period.items.reduce((s, i) => s + i.kasbonDeduction, 0)
  const totalOtherDeduction = period.items.reduce((s, i) => s + i.bpjsKesehatan + i.bpjsKetenagakerjaan + i.otherDeductions, 0)
  const totalNet = period.items.reduce((s, i) => s + i.netPay, 0)
  const expenseAmount = totalGross - totalOtherDeduction

  const description = `Pembayaran gaji periode ${period.period}`
  const transaction = await tx.transaction.create({
    data: {
      transactionNumber: await generateTransactionNumber(tx, "expense"),
      accountId: input.accountId,
      type: "expense",
      grossAmount: totalNet,
      cost: 0,
      netAmount: totalNet,
      description,
      occurredAt: input.paidAt,
      refType: "payroll",
      refId: period.id,
      createdById: input.createdBy,
    },
  })
  await logTransactionEvent(tx, { transactionId: transaction.id, action: "created", actorUserId: input.createdBy, metadata: { via: "Bayar Gaji", period: period.period } })

  const kasBankCoaCode = await getAccountCoaCode(tx, input.accountId)
  const journalEntry = await postJournalEntry(tx, {
    date: input.paidAt,
    description,
    sourceType: "payroll",
    sourceId: period.id,
    createdBy: input.createdBy,
    lines: payrollPaidLines({ kasBankCoaCode, expenseAmount, cashAmount: totalNet, kasbonAmount: totalKasbon }),
  })
  await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

  await tx.payrollPeriod.update({ where: { id: period.id }, data: { status: "posted", paidAt: input.paidAt, transactionId: transaction.id } })

  return { transaction, period }
}
