import { prisma } from "@/lib/prisma"
import { computeAccountBalance } from "@/lib/account-balance"
import { invoiceCashDue } from "@/lib/invoice-due"
import { computeDomainExpiryDate } from "@/lib/domain-status"
import { computeNextDueDate } from "@/lib/recurring-bill-status"
import { COA_CODE } from "./coa-seed"

/** Satu-satunya sumber "kalimat + angka konfirmasi" untuk SEMUA aksi posting/void keuangan —
 *  dipakai oleh GET /api/posting-preview dan ditampilkan apa adanya oleh PostingConfirmDialog.
 *  Sengaja dihitung di server (bukan dirangkai di tiap komponen UI) supaya: (1) angka saldo yang
 *  ditampilkan benar-benar saldo terkini dari database, bukan tebakan dari props halaman yang
 *  bisa basi, dan (2) aturan "kas/bank tidak boleh minus" cuma didefinisikan sekali di sini untuk
 *  tampilannya + sekali di cash-guard.ts untuk penegakannya (yang mengunci beneran). */

export type PostingPreviewKind =
  | "transaction"
  | "transaction-void"
  | "payment"
  | "payment-void"
  | "account-transfer"
  | "account-transfer-void"
  | "journal-entry"
  | "journal-entry-void"
  | "invoice"
  | "revenue-slot"

export interface PreviewRow {
  label: string
  value: string
  /** "negative" = angka merah (uang keluar/biaya), "positive" = hijau, "total" = dicetak tebal
   *  dengan garis pemisah di atasnya. */
  tone?: "default" | "negative" | "positive" | "total"
}

export interface PreviewBalance {
  accountName: string
  current: number
  delta: number
  after: number
}

export interface PostingPreview {
  /** Judul modal — "Posting Kas Keluar BKK/2026/00123?" */
  title: string
  /** Kalimat konfirmasi utama, sudah lengkap dengan nominal & nama akun. */
  headline: string
  rows: PreviewRow[]
  /** Rincian yang disembunyikan di balik "Lihat rincian" (mis. 5 bucket Slotting Omset, daftar
   *  invoice yang dilunasi, baris debit/kredit jurnal). */
  detailLabel?: string
  detailRows?: PreviewRow[]
  balances: PreviewBalance[]
  /** Label judul blok saldo — beda untuk jurnal manual (saldo buku besar, bukan saldo akun). */
  balanceLabel?: string
  blocked: boolean
  blockMessage?: string
  /** Catatan tambahan (bukan blocker) — mis. "sekali diproses tidak bisa dibatalkan". */
  warning?: string
  confirmLabel: string
  /** true = aksi ini membatalkan sesuatu (tombol konfirmasi merah + minta alasan). */
  isVoid?: boolean
}

const EPSILON = 0.5

function rupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`
}

function tanggal(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d)
}

/** Blok saldo + penentuan blokir dipusatkan di sini supaya semua jenis transaksi memakai aturan
 *  yang sama: yang dicek cuma akun yang saldonya BERKURANG (delta negatif) — akun yang bertambah
 *  tidak mungkin bikin masalah, dan akun yang saldonya sudah minus dari data lama tetap boleh
 *  ditambahi/dikoreksi. */
function summarizeBalances(balances: PreviewBalance[]): Pick<PostingPreview, "balances" | "blocked" | "blockMessage"> {
  const offending = balances.filter((b) => b.delta < 0 && b.after < -EPSILON)
  if (offending.length === 0) return { balances, blocked: false }
  const names = offending.map((b) => b.accountName).join(", ")
  return {
    balances,
    blocked: true,
    blockMessage: `Saldo ${names} tidak boleh minus. Kurangi nominalnya, atau pakai akun kas/bank lain yang saldonya cukup.`,
  }
}

async function balanceFor(accountId: string, accountName: string, delta: number): Promise<PreviewBalance> {
  const current = await computeAccountBalance(accountId)
  return { accountName, current, delta, after: current + delta }
}

/** Nama jenis transaksi yang dipakai staf — dipakai di judul & kalimat konfirmasi. */
function transactionLabel(t: { type: string; refType: string | null }): string {
  if (t.refType === "server") return "Bayar Server"
  if (t.refType === "domain") return "Bayar Domain"
  if (t.refType === "maintenance") return "Bayar Maintenance"
  if (t.refType === "recurring_bill") return "Bayar Biaya Berkala"
  if (t.refType === "kasbon") return t.type === "expense" ? "Pencairan Kasbon" : "Pelunasan Kasbon"
  return t.type === "expense" ? "Kas Keluar" : "Kas Masuk"
}

export async function buildPostingPreview(
  kind: PostingPreviewKind,
  id: string,
  options?: { feeOverrides?: Record<string, boolean> }
): Promise<PostingPreview> {
  switch (kind) {
    case "transaction":
    case "transaction-void":
      return transactionPreview(id, kind === "transaction-void")
    case "payment":
    case "payment-void":
      return paymentPreview(id, kind === "payment-void")
    case "account-transfer":
    case "account-transfer-void":
      return accountTransferPreview(id, kind === "account-transfer-void")
    case "journal-entry":
    case "journal-entry-void":
      return journalEntryPreview(id, kind === "journal-entry-void")
    case "invoice":
      return invoicePreview(id)
    case "revenue-slot":
      return revenueSlotPreview(id, options?.feeOverrides ?? null)
  }
}

async function transactionPreview(id: string, isVoid: boolean): Promise<PostingPreview> {
  const t = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true, category: true },
  })
  if (!t) throw new Error("Transaksi tidak ditemukan")

  const label = transactionLabel(t)
  const isExpense = t.type === "expense"
  // Pemasukan menambah saldo sebesar NET (gross - biaya, lihat computeAccountBalance),
  // pengeluaran mengurangi sebesar GROSS. Void = kebalikannya.
  const baseDelta = isExpense ? -t.grossAmount : t.netAmount
  const delta = isVoid ? -baseDelta : baseDelta

  const rows: PreviewRow[] = [
    { label: "Tanggal", value: tanggal(t.occurredAt) },
    { label: "Akun kas/bank", value: t.account.name },
    { label: "Keterangan", value: t.description || "-" },
  ]
  if (t.category) rows.push({ label: isExpense ? "Kategori biaya" : "Kategori pemasukan", value: t.category.name })
  rows.push({ label: isExpense ? "Nominal keluar" : "Uang masuk", value: rupiah(t.grossAmount), tone: isExpense ? "negative" : "positive" })
  if (!isExpense && t.cost > 0) {
    rows.push({ label: "Biaya/HPP", value: `-${rupiah(t.cost)}`, tone: "negative" })
    rows.push({ label: "Bersih masuk", value: rupiah(t.netAmount), tone: "total" })
  }

  // Efek ikutan yang perlu staf tahu SEBELUM posting (semuanya terjadi di
  // finalizeTransactionPosting) — tanggal jatuh tempo berikutnya & sisa kasbon.
  let efek = ""
  if (!isVoid && t.refType && t.refId) {
    if (t.refType === "domain") {
      const domain = await prisma.domain.findUnique({ where: { id: t.refId }, select: { name: true, expiryDate: true, lastPaidAt: true } })
      const next = computeDomainExpiryDate(domain?.expiryDate ?? domain?.lastPaidAt ?? t.occurredAt) ?? t.occurredAt
      rows.push({ label: "Domain", value: domain?.name ?? "-" })
      rows.push({ label: "Berlaku s/d setelah posting", value: tanggal(next) })
      efek = `, dan domain ${domain?.name ?? ""} ditandai lunas s/d ${tanggal(next)}`
    } else if (t.refType === "server") {
      const server = await prisma.server.findUnique({ where: { id: t.refId }, include: { period: true } })
      const next = computeNextDueDate(server?.expiryDate ?? server?.lastPaidAt ?? t.occurredAt, server?.period?.name, server?.periodCount) ?? t.occurredAt
      rows.push({ label: "Server", value: server?.name ?? "-" })
      rows.push({ label: "Berlaku s/d setelah posting", value: tanggal(next) })
      efek = `, dan server ${server?.name ?? ""} ditandai lunas s/d ${tanggal(next)}`
    } else if (t.refType === "recurring_bill") {
      const bill = await prisma.recurringBill.findUnique({ where: { id: t.refId }, include: { period: true } })
      const next = computeNextDueDate(t.occurredAt, bill?.period?.name, bill?.periodCount)
      rows.push({ label: "Biaya berkala", value: bill?.name ?? "-" })
      if (next) rows.push({ label: "Jatuh tempo berikutnya", value: tanggal(next) })
      efek = next ? `, dan jatuh tempo berikutnya digeser ke ${tanggal(next)}` : ""
    } else if (t.refType === "maintenance") {
      const maintenance = await prisma.maintenance.findUnique({ where: { id: t.refId }, select: { name: true } })
      rows.push({ label: "Maintenance", value: maintenance?.name ?? "-" })
    } else if (t.refType === "kasbon") {
      const kasbon = await prisma.kasbon.findUnique({ where: { id: t.refId }, include: { user: { select: { name: true } } } })
      const sums = await prisma.transaction.groupBy({
        by: ["type"],
        where: { refType: "kasbon", refId: t.refId, postStatus: "posted" },
        _sum: { grossAmount: true },
      })
      const disbursed = sums.find((s) => s.type === "expense")?._sum.grossAmount ?? 0
      const repaid = sums.find((s) => s.type === "income")?._sum.grossAmount ?? 0
      const sisaSetelah = disbursed - repaid + (isExpense ? t.grossAmount : -t.grossAmount)
      rows.push({ label: "Karyawan", value: kasbon?.user.name ?? "-" })
      rows.push({ label: "Sisa kasbon setelah posting", value: sisaSetelah <= EPSILON ? "Lunas" : rupiah(sisaSetelah), tone: "total" })
      efek = isExpense
        ? ", dicatat sebagai Piutang Karyawan (bukan beban)"
        : sisaSetelah <= EPSILON
          ? ", dan kasbon ini jadi LUNAS"
          : `, sisa kasbon jadi ${rupiah(sisaSetelah)}`
    }
  }

  const summary = summarizeBalances([await balanceFor(t.accountId, t.account.name, delta)])
  const after = summary.balances[0].after
  const nomor = t.transactionNumber ?? ""

  const headline = isVoid
    ? `Batalkan ${label} ${nomor}? ${rupiah(Math.abs(delta))} akan ${delta < 0 ? "ditarik kembali dari" : "dikembalikan ke"} ${t.account.name} — saldonya jadi ${rupiah(after)}. Datanya tetap tersimpan di riwayat dengan status "Dibatalkan".`
    : `Posting ${label} ${nomor}? ${rupiah(Math.abs(delta))} ${isExpense ? "keluar dari" : "masuk ke"} ${t.account.name}${efek}. Saldo ${t.account.name} jadi ${rupiah(after)}.`

  return {
    title: isVoid ? `Batalkan ${label}?` : `Posting ${label}?`,
    headline,
    rows,
    ...summary,
    balanceLabel: isVoid ? "Saldo setelah dibatalkan" : "Saldo setelah posting",
    confirmLabel: isVoid ? "Ya, Batalkan" : "Ya, Posting",
    isVoid,
  }
}

async function paymentPreview(id: string, isVoid: boolean): Promise<PostingPreview> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
  })
  if (!payment) throw new Error("Pembayaran tidak ditemukan")

  // Baris Transaction milik payment ini: yang income = uang masuk pelunasan, yang expense =
  // baris Biaya (costLink Bayar Domain/Server/Maintenance) yang ikut diposting bareng.
  const transactions = await prisma.transaction.findMany({
    where: { paymentId: id, postStatus: isVoid ? "posted" : "draft" },
    include: { account: true },
  })
  const masuk = transactions.filter((t) => t.type === "income")
  const keluar = transactions.filter((t) => t.type === "expense")
  const totalMasukNet = masuk.reduce((s, t) => s + t.netAmount, 0)
  const totalBiayaHpp = masuk.reduce((s, t) => s + t.cost, 0)
  const totalKeluar = keluar.reduce((s, t) => s + t.grossAmount, 0)
  const baseDelta = totalMasukNet - totalKeluar
  const delta = isVoid ? -baseDelta : baseDelta

  const rows: PreviewRow[] = [
    { label: "Tanggal", value: tanggal(payment.paidAt) },
    { label: "Klien", value: payment.client.name },
    { label: "Akun kas/bank", value: payment.account.name },
    { label: "Uang masuk", value: rupiah(payment.totalAmount), tone: "positive" },
  ]
  if (totalBiayaHpp > 0) rows.push({ label: "Biaya/HPP dipotong", value: `-${rupiah(totalBiayaHpp)}`, tone: "negative" })
  if (totalKeluar > 0) rows.push({ label: "Baris Biaya (bayar domain/server/maintenance)", value: `-${rupiah(totalKeluar)}`, tone: "negative" })
  rows.push({ label: "Bersih masuk", value: rupiah(baseDelta), tone: "total" })

  const detailRows: PreviewRow[] = []
  for (const ip of payment.invoicePayments) {
    // Status invoice setelah aksi ini — dihitung dari SEMUA pelunasan yang (akan) posted, pakai
    // invoiceCashDue supaya client Pemungut PPN tidak dianggap kurang bayar sebesar PPN-nya.
    const postedLain = await prisma.invoicePayment.findMany({
      where: {
        invoiceId: ip.invoiceId,
        paymentId: { not: id },
        OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }],
      },
      select: { amount: true },
    })
    const totalLain = postedLain.reduce((s, p) => s + p.amount, 0)
    const totalSetelah = isVoid ? totalLain : totalLain + ip.amount
    const cashDue = invoiceCashDue(ip.invoice, payment.client.isPemungutPpn)
    const status = totalSetelah >= cashDue - EPSILON ? "Lunas" : totalSetelah > 0 ? "Sebagian" : "Belum Lunas"
    detailRows.push({ label: `${ip.invoice.invoiceNumber} — ${rupiah(ip.amount)}`, value: `jadi ${status}` })
  }
  for (const t of keluar) {
    detailRows.push({ label: `Biaya: ${t.description ?? "-"}`, value: `-${rupiah(t.grossAmount)}`, tone: "negative" })
  }

  const summary = summarizeBalances([await balanceFor(payment.accountId, payment.account.name, delta)])
  const after = summary.balances[0].after
  const statusList = payment.invoicePayments.map((ip) => ip.invoice.invoiceNumber).join(", ")

  const headline = isVoid
    ? `Batalkan Pembayaran ${payment.paymentNumber} dari ${payment.client.name}? ${rupiah(Math.abs(delta))} akan ditarik kembali dari ${payment.account.name} (saldo jadi ${rupiah(after)}), dan piutang invoice ${statusList} kembali seperti sebelum pembayaran ini ada.`
    : `Posting Pembayaran ${payment.paymentNumber} dari ${payment.client.name}? Bersih ${rupiah(baseDelta)} masuk ke ${payment.account.name} — saldonya jadi ${rupiah(after)}. Status invoice ${statusList} diperbarui, dan draft Slotting Omset otomatis dibuat.`

  return {
    title: isVoid ? "Batalkan Pembayaran?" : "Posting Pembayaran?",
    headline,
    rows,
    detailLabel: detailRows.length > 0 ? "Lihat rincian invoice & biaya" : undefined,
    detailRows: detailRows.length > 0 ? detailRows : undefined,
    ...summary,
    balanceLabel: isVoid ? "Saldo setelah dibatalkan" : "Saldo setelah posting",
    confirmLabel: isVoid ? "Ya, Batalkan" : "Ya, Posting",
    isVoid,
  }
}

async function accountTransferPreview(id: string, isVoid: boolean): Promise<PostingPreview> {
  const transfer = await prisma.accountTransfer.findUnique({
    where: { id },
    include: { sourceAccount: true, destinationAccount: true },
  })
  if (!transfer) throw new Error("Pindah Buku tidak ditemukan")

  const keluarDari = isVoid ? transfer.destinationAccount : transfer.sourceAccount
  const masukKe = isVoid ? transfer.sourceAccount : transfer.destinationAccount
  const summary = summarizeBalances([
    await balanceFor(keluarDari.id, keluarDari.name, -transfer.amount),
    await balanceFor(masukKe.id, masukKe.name, transfer.amount),
  ])
  const [sisiKeluar, sisiMasuk] = summary.balances

  const rows: PreviewRow[] = [
    { label: "Tanggal", value: tanggal(transfer.occurredAt) },
    { label: "Dari akun", value: transfer.sourceAccount.name },
    { label: "Ke akun", value: transfer.destinationAccount.name },
    { label: "Keterangan", value: transfer.description || "-" },
    { label: "Nominal", value: rupiah(transfer.amount), tone: "total" },
  ]

  const nomor = transfer.transferNumber ?? ""
  const headline = isVoid
    ? `Batalkan Pindah Buku ${nomor}? ${rupiah(transfer.amount)} kembali ke ${sisiMasuk.accountName} (jadi ${rupiah(sisiMasuk.after)}) dan ditarik dari ${sisiKeluar.accountName} (jadi ${rupiah(sisiKeluar.after)}).`
    : `Posting Pindah Buku ${nomor}? ${rupiah(transfer.amount)} dipindah dari ${sisiKeluar.accountName} ke ${sisiMasuk.accountName}. Saldo ${sisiKeluar.accountName} jadi ${rupiah(sisiKeluar.after)}, saldo ${sisiMasuk.accountName} jadi ${rupiah(sisiMasuk.after)}.`

  return {
    title: isVoid ? "Batalkan Pindah Buku?" : "Posting Pindah Buku?",
    headline,
    rows,
    ...summary,
    balanceLabel: isVoid ? "Saldo setelah dibatalkan" : "Saldo setelah posting",
    confirmLabel: isVoid ? "Ya, Batalkan" : "Ya, Posting",
    isVoid,
  }
}

async function journalEntryPreview(id: string, isVoid: boolean): Promise<PostingPreview> {
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { lines: { include: { account: true } } },
  })
  if (!entry) throw new Error("Jurnal tidak ditemukan")

  const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
  const totalKredit = entry.lines.reduce((s, l) => s + l.credit, 0)

  const rows: PreviewRow[] = [
    { label: "Tanggal", value: tanggal(entry.date) },
    { label: "Keterangan", value: entry.description },
    { label: "Jumlah baris", value: `${entry.lines.length} baris` },
    { label: "Total debit", value: rupiah(totalDebit) },
    { label: "Total kredit", value: rupiah(totalKredit), tone: "total" },
  ]
  const detailRows: PreviewRow[] = entry.lines.map((l) => ({
    label: `${l.account.code} — ${l.account.name}`,
    value: l.debit > 0 ? `D ${rupiah(l.debit)}` : `K ${rupiah(l.credit)}`,
    tone: l.debit > 0 ? "default" : "negative",
  }))

  // Jurnal manual tidak lewat Transaction/AccountTransfer, jadi saldo Account tidak bergerak —
  // yang bergerak saldo akun COA Kas & Bank di Buku Besar. Itu yang ditampilkan & dijaga di sini
  // (padanan assertKasBankCoaNotNegative di cash-guard.ts).
  const kasBankParent = await prisma.chartOfAccount.findUnique({ where: { code: COA_CODE.kasBankParent }, select: { id: true } })
  const balances: PreviewBalance[] = []
  const seen = new Set<string>()
  for (const line of entry.lines) {
    const coa = line.account
    const isKasBank = coa.code === COA_CODE.kasBankParent || (kasBankParent != null && coa.parentId === kasBankParent.id)
    if (!isKasBank || seen.has(coa.id)) continue
    seen.add(coa.id)
    const agg = await prisma.journalLine.aggregate({
      where: { accountId: coa.id, journalEntry: { postStatus: "posted" } },
      _sum: { debit: true, credit: true },
    })
    const posted = (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0)
    // Saat POSTING, jurnal ini masih draft (belum ikut terhitung di `posted`) -> deltanya
    // ditambahkan. Saat VOID, jurnal ini SUDAH ikut terhitung -> deltanya harus dikurangi lagi.
    const lineDelta = entry.lines
      .filter((l) => l.accountId === coa.id)
      .reduce((s, l) => s + l.debit - l.credit, 0)
    const delta = isVoid ? -lineDelta : lineDelta
    const current = posted
    balances.push({ accountName: `${coa.code} — ${coa.name}`, current, delta, after: current + delta })
  }

  const summary = summarizeBalances(balances)
  const nomor = entry.entryNumber
  const kasBankRingkas = balances
    .map((b) => `${b.accountName} jadi ${rupiah(b.after)}`)
    .join(", ")

  const headline = isVoid
    ? `Batalkan jurnal manual ${nomor}? Jurnal ini tetap tampil di Jurnal Umum dengan status "Dibatalkan", tapi tidak lagi dihitung di saldo/laporan mana pun.${kasBankRingkas ? ` Saldo buku besar ${kasBankRingkas}.` : ""}`
    : `Posting jurnal manual ${nomor}? Total debit ${rupiah(totalDebit)} = total kredit ${rupiah(totalKredit)}.${kasBankRingkas ? ` Saldo buku besar ${kasBankRingkas}.` : " Tidak ada akun kas/bank yang tersentuh."}`

  return {
    title: isVoid ? "Batalkan Jurnal Manual?" : "Posting Jurnal Manual?",
    headline,
    rows,
    detailLabel: "Lihat rincian debit/kredit",
    detailRows,
    ...summary,
    balanceLabel: `Saldo buku besar Kas & Bank setelah ${isVoid ? "dibatalkan" : "posting"}`,
    confirmLabel: isVoid ? "Ya, Batalkan" : "Ya, Posting",
    isVoid,
  }
}

async function invoicePreview(id: string): Promise<PostingPreview> {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { client: true, lines: true } })
  if (!invoice) throw new Error("Invoice tidak ditemukan")

  const rows: PreviewRow[] = [
    { label: "Tanggal invoice", value: tanggal(invoice.issuedAt) },
    { label: "Jatuh tempo", value: invoice.dueDate ? tanggal(invoice.dueDate) : "-" },
    { label: "Klien", value: invoice.client.name },
    { label: "Jumlah item", value: `${invoice.lines.length} item` },
    { label: "Subtotal", value: rupiah(invoice.subtotal) },
  ]
  if (invoice.ppnEnabled) rows.push({ label: "PPN", value: rupiah(invoice.ppnAmount) })
  rows.push({ label: "Total tagihan", value: rupiah(invoice.totalAmount), tone: "total" })

  return {
    title: "Posting Invoice?",
    headline: `Posting Invoice ${invoice.invoiceNumber} ke ${invoice.client.name}? Nilai ${rupiah(invoice.totalAmount)} resmi masuk Piutang mulai ${tanggal(invoice.issuedAt)}${invoice.dueDate ? `, jatuh tempo ${tanggal(invoice.dueDate)}` : ""}. Kas/bank belum bergerak — baru berubah saat pembayarannya diposting.`,
    rows,
    balances: [],
    blocked: false,
    confirmLabel: "Ya, Posting",
  }
}

const BUCKET_KEYS = ["Operasional", "Direksi", "Cadangan Modal/HPP", "Bonus", "Laba Ditahan/Dana Darurat"] as const

async function revenueSlotPreview(id: string, feeOverrides: Record<string, boolean> | null): Promise<PostingPreview> {
  const slot = await prisma.revenueSlot.findUnique({
    where: { id },
    include: { payment: { include: { account: true, client: true } }, costLines: true },
  })
  if (!slot) throw new Error("Slotting Omset tidak ditemukan")

  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })
  const bucketConfig: { label: (typeof BUCKET_KEYS)[number]; pct: number; accountId: string | null }[] = [
    { label: "Operasional", pct: settings.slottingOperasionalPct, accountId: settings.slottingOperasionalAccountId },
    { label: "Direksi", pct: settings.slottingDireksiPct, accountId: settings.slottingDireksiAccountId },
    { label: "Cadangan Modal/HPP", pct: settings.slottingHppReservePct, accountId: settings.slottingHppReserveAccountId },
    { label: "Bonus", pct: settings.slottingBonusPct, accountId: settings.slottingBonusAccountId },
    { label: "Laba Ditahan/Dana Darurat", pct: settings.slottingLabaDitahanPct, accountId: settings.slottingLabaDitahanAccountId },
  ]

  const netAmount = slot.grossAmount - slot.initialCostAmount - slot.additionalCostAmount
  const sourceAccount = slot.payment.account

  const rows: PreviewRow[] = [
    { label: "Pembayaran", value: `${slot.payment.paymentNumber} — ${slot.payment.client.name}` },
    { label: "Rekening sumber", value: sourceAccount.name },
    { label: "Uang masuk", value: rupiah(slot.grossAmount), tone: "positive" },
    { label: "Biaya saat pembayaran", value: `-${rupiah(slot.initialCostAmount)}`, tone: "negative" },
  ]
  if (slot.additionalCostAmount > 0) rows.push({ label: "Biaya tambahan", value: `-${rupiah(slot.additionalCostAmount)}`, tone: "negative" })
  rows.push({ label: "Laba bersih dibagi", value: rupiah(netAmount), tone: "total" })

  // Nominal per bucket & biaya adminnya — rumusnya sengaja disamakan dengan
  // POST /api/revenue-slots/[id]/process (pembulatan per bucket + fee dipotong dari transfer).
  const accountIds = bucketConfig.map((b) => b.accountId).filter((x): x is string => !!x)
  const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } })
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const detailRows: PreviewRow[] = []
  const problems: string[] = []
  let totalKeluar = 0
  let totalFee = 0
  const destinationDeltas = new Map<string, number>()

  for (const bucket of bucketConfig) {
    const nominal = Math.round((netAmount * bucket.pct) / 100)
    const destination = bucket.accountId ? accountById.get(bucket.accountId) : undefined
    if (!destination) {
      problems.push(`rekening tujuan ${bucket.label} belum di-set di Pengaturan`)
      detailRows.push({ label: `${bucket.label} (${bucket.pct}%)`, value: "rekening belum di-set", tone: "negative" })
      continue
    }
    const feeApplies =
      feeOverrides && bucket.label in feeOverrides
        ? feeOverrides[bucket.label]
        : sourceAccount.type === "bank" && destination.type === "bank" && sourceAccount.bankName !== destination.bankName
    const fee = feeApplies ? settings.slottingTransferFee : 0
    const transferAmount = nominal - fee
    if (nominal > 0 && transferAmount <= 0) {
      problems.push(`porsi ${bucket.label} (${rupiah(nominal)}) lebih kecil dari biaya admin transfer (${rupiah(fee)})`)
    }
    totalKeluar += nominal
    totalFee += fee
    destinationDeltas.set(destination.id, (destinationDeltas.get(destination.id) ?? 0) + transferAmount)
    detailRows.push({
      label: `${bucket.label} (${bucket.pct}%) → ${destination.name}`,
      value: fee > 0 ? `${rupiah(transferAmount)} (biaya admin ${rupiah(fee)})` : rupiah(transferAmount),
    })
  }

  const totalPct = bucketConfig.reduce((s, b) => s + b.pct, 0)
  if (Math.abs(totalPct - 100) > 0.01) problems.push(`total persentase di Pengaturan harus 100% (sekarang ${totalPct}%)`)
  if (netAmount <= 0) problems.push(`laba bersih tidak positif (${rupiah(netAmount)})`)
  if (totalFee > 0) detailRows.push({ label: "Total biaya admin transfer", value: `-${rupiah(totalFee)}`, tone: "negative" })

  const balances: PreviewBalance[] = [await balanceFor(sourceAccount.id, sourceAccount.name, -totalKeluar)]
  for (const [accountId, delta] of destinationDeltas) {
    if (accountId === sourceAccount.id) continue
    const account = accountById.get(accountId)
    if (account) balances.push(await balanceFor(account.id, account.name, delta))
  }

  const summary = summarizeBalances(balances)
  const blocked = summary.blocked || problems.length > 0
  const blockMessage = summary.blocked
    ? summary.blockMessage
    : problems.length > 0
      ? `Belum bisa diproses: ${problems.join("; ")}.`
      : undefined

  const sumber = summary.balances[0]
  return {
    title: "Proses Slotting Omset?",
    headline: `Proses Slotting Omset untuk ${slot.payment.paymentNumber}? Laba bersih ${rupiah(netAmount)} akan dibagi ke ${bucketConfig.length} rekening lewat Pindah Buku otomatis${totalFee > 0 ? ` + biaya admin ${rupiah(totalFee)}` : ""}. Total ${rupiah(totalKeluar)} keluar dari ${sumber.accountName} — saldonya jadi ${rupiah(sumber.after)}.`,
    rows,
    detailLabel: "Lihat rincian pembagian",
    detailRows,
    balances: summary.balances,
    balanceLabel: "Saldo setelah diproses",
    blocked,
    blockMessage,
    warning: "Sekali diproses, Slotting Omset ini tidak bisa dibatalkan.",
    confirmLabel: "Ya, Proses",
  }
}
