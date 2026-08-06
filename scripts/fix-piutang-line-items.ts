/**
 * Perbaikan sekali-jalan atas 223 invoice piutang hasil migrate-legacy-sales.ts: ganti dari
 * "1 baris konsolidasi (sisa belum dibayar)" jadi struktur ASLI sesuai t_penjualan (header) +
 * t_penjualandet (baris item, per jasa) — supaya bisa dicetak ulang mirip invoice aslinya.
 *
 * Nilai total sekarang pakai grandtotal ASLI (bukan cuma sisa blmbayar). Untuk invoice yang
 * sudah ada bayar sebagian di sistem lama (sdhbayar>0), dibuatkan 1 InvoicePayment "saldo awal
 * migrasi" ke akun khusus "Migrasi - Piutang Lama" (BUKAN Kas Utama/Bank aktif — duit itu sudah
 * lama diterima & terpakai, bukan uang riil yang ada sekarang) — TANPA Transaction/split (field
 * transactionId dibiarkan kosong) supaya tidak mencemari laporan keuangan/split periode berjalan.
 *
 * Prasyarat: migrate-legacy-sales.ts sudah pernah dijalankan (Item, LegacySalesClient, Client
 * sudah ke-link). Aman dijalankan ulang (invoice lama di-hapus dulu by legacyId sebelum dibuat
 * ulang) SELAMA belum ada pembayaran riil (lewat menu Pelunasan Bertahap) tercatat di invoice
 * migrasi itu — script akan berhenti kalau mendeteksi itu.
 *
 * Jalankan: npx tsx scripts/fix-piutang-line-items.ts -- <folder-berisi-3-file-tsv>
 *   (penjualan_unpaid_full.tsv, penjualandet_unpaid.tsv — lihat query di komentar bawah)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { prisma } from "../src/lib/prisma"
import { generateInvoiceNumber } from "../src/lib/invoice-number"

const dataDir = process.argv[2]
if (!dataDir) {
  console.error("Pakai: npx tsx scripts/fix-piutang-line-items.ts <folder-berisi-tsv>")
  process.exit(1)
}

function parseTsv(filePath: string): Record<string, string | null>[] {
  const content = readFileSync(filePath, "utf-8").trim()
  const lines = content.split("\n")
  const headers = lines[0].split("\t")
  return lines.slice(1).map((line) => {
    const cells = line.split("\t")
    const row: Record<string, string | null> = {}
    headers.forEach((h, i) => {
      const value = cells[i]
      row[h] = value === undefined || value === "NULL" || value === "" ? null : value
    })
    return row
  })
}

function parseLegacyDate(raw: string | null): Date | null {
  if (!raw || raw.startsWith("0000-00-00")) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

async function main() {
  const headers = parseTsv(join(dataDir, "penjualan_unpaid_full.tsv"))
  const details = parseTsv(join(dataDir, "penjualandet_unpaid.tsv"))

  const detailsByTempId = new Map<string, typeof details>()
  for (const d of details) {
    const key = d.temp_id!
    const list = detailsByTempId.get(key) ?? []
    list.push(d)
    detailsByTempId.set(key, list)
  }

  const alreadyPaid = await prisma.invoice.findMany({
    where: { legacyId: { not: null } },
    include: { payments: true },
  })
  const withRealPayments = alreadyPaid.filter((inv) => inv.payments.length > 0)
  if (withRealPayments.length > 0) {
    console.error(
      `[fix-piutang] BERHENTI: ${withRealPayments.length} invoice migrasi sudah punya pembayaran riil (lewat Pelunasan Bertahap) — tidak aman dihapus ulang. Cek dulu manual.`
    )
    process.exit(1)
  }

  const migrationAccount = await prisma.account.upsert({
    where: { id: "migrasi-piutang-lama" },
    update: {},
    create: { id: "migrasi-piutang-lama", name: "Migrasi - Piutang Lama", type: "kas", openingBalance: 0 },
  })
  console.log(`[fix-piutang] Akun "${migrationAccount.name}" siap (histori saja, bukan kas riil).`)

  const legacyIds = alreadyPaid.map((inv) => inv.legacyId!).filter(Boolean)
  await prisma.invoice.deleteMany({ where: { legacyId: { in: legacyIds } } })
  console.log(`[fix-piutang] ${legacyIds.length} invoice migrasi lama dihapus, akan dibuat ulang.`)

  let created = 0
  let paymentsCreated = 0
  let skipped = 0

  for (const header of headers) {
    const legacyId = header.id!
    const tempId = header.temp_id!
    const lines = detailsByTempId.get(tempId) ?? []

    const legacySalesClient = await prisma.legacySalesClient.findUnique({ where: { legacyId: Number(header.idpelanggan) } })
    let client = legacySalesClient ? await prisma.client.findUnique({ where: { legacySalesClientId: legacySalesClient.id } }) : null

    // Nama generik ("UMUM" dsb) bisa muncul sebagai beberapa baris m_pelanggan berbeda di sumber
    // lama, tapi Client.legacySalesClientId unik per Client — cuma satu yang bisa ke-link
    // langsung. Sisanya dicocokkan by nama persis ke Client yang sudah ada.
    if (!client && legacySalesClient) {
      client = await prisma.client.findFirst({ where: { name: { equals: legacySalesClient.name, mode: "insensitive" } } })
    }

    if (!client) {
      console.warn(`[fix-piutang] Lewati ${header.nobukti}: client untuk idpelanggan=${header.idpelanggan} tidak ditemukan`)
      skipped++
      continue
    }

    const subtotal = Number(header.total)
    const ppnAmount = Number(header.pajak) || 0
    const ppnEnabled = header.ytpajak === "Y"
    const ppnRate = ppnEnabled && subtotal > 0 ? Math.round((ppnAmount / subtotal) * 10000) / 100 : 0
    const totalAmount = Number(header.grandtotal)
    const sdhbayar = Number(header.sdhbayar) || 0

    const preparedLines =
      lines.length > 0
        ? lines.map((d) => {
            const qty = Number(d.qty) || 1
            const unitPrice = Number(d.harga) || 0
            const discountAmount = Number(d.nominaldiskon) || 0
            return {
              description: (d.jasa_nama ?? `Item #${d.idbarang}`).trim() || `Item #${d.idbarang}`,
              qty,
              unitPrice,
              unitCost: 0,
              discountAmount,
              lineTotal: Number(d.total) || qty * unitPrice - discountAmount,
            }
          })
        : [
            {
              description: `Migrasi piutang - ${header.nobukti} (baris asli tidak ditemukan)`,
              qty: 1,
              unitPrice: subtotal,
              unitCost: 0,
              discountAmount: 0,
              lineTotal: subtotal,
            },
          ]

    const totalLineDiscount = preparedLines.reduce((s, l) => s + l.discountAmount, 0)
    const invoiceNumber = await generateInvoiceNumber()

    const invoice = await prisma.invoice.create({
      data: {
        legacyId,
        invoiceNumber,
        clientId: client.id,
        issuedAt: parseLegacyDate(header.tglinvoice) ?? new Date(),
        dueDate: parseLegacyDate(header.jatuhtempo),
        subtotal,
        discountAmount: totalLineDiscount,
        ppnEnabled,
        ppnRate,
        ppnAmount,
        totalAmount,
        totalCost: 0,
        status: sdhbayar > 0 ? "partial" : "unpaid",
        notes: `Migrasi piutang dari aplikasi penjualan lama — no. bukti asli: ${header.nobukti}`,
        lines: { create: preparedLines },
      },
    })
    created++

    if (sdhbayar > 0) {
      await prisma.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          accountId: migrationAccount.id,
          amount: sdhbayar,
          paidAt: parseLegacyDate(header.tglinvoice) ?? new Date(),
          notes: "Saldo awal migrasi — sudah dibayar di sistem lama sebelum sistem ini dipakai (bukan Transaction/split, cuma catatan histori).",
        },
      })
      paymentsCreated++
    }
  }

  console.log(`[fix-piutang] Invoice dibuat ulang: ${created} (dilewati: ${skipped}), pembayaran saldo awal: ${paymentsCreated}`)
  console.log("[fix-piutang] Selesai.")
}

main()
  .catch((e) => {
    console.error("[fix-piutang] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
