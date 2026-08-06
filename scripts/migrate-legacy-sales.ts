/**
 * Migrasi ke-2 (sekali-jalan, idempotent): aplikasi penjualan lama (server terpisah dari
 * migrate-legacy.ts). Server sumbernya cuma terima koneksi MySQL lewat Unix socket lokal (tidak
 * ada TCP listener sama sekali), jadi SSH port-forward (pola migrate-legacy.ts) tidak bisa
 * dipakai — datanya di-export dulu jadi file TSV lewat `ssh ... mysql -B -e "SELECT ..."`
 * (lihat perintah di bawah), baru script ini baca file lokalnya dan upsert ke Postgres.
 *
 * Cara re-export TSV (ganti path scratchpad sesuai sesi):
 *   ssh -p 22 slim_7sm1@157.15.77.86 "mysql -u slim_7sm1 -p'<password>' -D slim_7sm1_db_helios -B \
 *     -e 'SELECT id, nama, hjual FROM m_jasa WHERE isdeleted=0 OR isdeleted IS NULL;'" > jasa.tsv
 *   (idem untuk m_pelanggan dan t_penjualan blmbayar>0 — lihat nama kolom di JASA_FILE dst di bawah)
 *
 * Jalankan: npm run migrate:legacy-sales -- <folder-berisi-3-file-tsv>
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { prisma } from "../src/lib/prisma"
import { normalizePhoneNumber } from "../src/lib/wahub"
import { generateInvoiceNumber } from "../src/lib/invoice-number"

const dataDir = process.argv[2]
if (!dataDir) {
  console.error("Pakai: npm run migrate:legacy-sales -- <folder-berisi-jasa.tsv,pelanggan.tsv,penjualan_unpaid.tsv>")
  process.exit(1)
}

/** Parser TSV sederhana — data sumber sudah dicek bersih (jumlah kolom konsisten per baris,
 *  tidak ada tab/newline nyasar di dalam field), jadi split("\t") polos aman dipakai. */
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

async function migrateJasa() {
  const rows = parseTsv(join(dataDir, "jasa.tsv"))
  let count = 0
  for (const row of rows) {
    const legacyId = Number(row.id)
    const name = (row.nama ?? "(tanpa nama)").trim() || "(tanpa nama)"
    const defaultPrice = row.hjual ? Number(row.hjual) : 0
    await prisma.item.upsert({
      where: { legacyId },
      update: { name, defaultPrice, type: "jasa" },
      create: { legacyId, name, defaultPrice, type: "jasa" },
    })
    count++
  }
  console.log(`[migrate-sales] Item (m_jasa): ${count}`)
}

interface PelangganRow {
  id: number
  kode: string | null
  namalengkap: string | null
  nama: string | null
  hp: string | null
  alamat: string | null
  bank: string | null
  norek: string | null
  top: number | null
  plafon: string | null
}

async function migratePelangganStaging(): Promise<Map<number, PelangganRow>> {
  const rows = parseTsv(join(dataDir, "pelanggan.tsv"))
  const byLegacyId = new Map<number, PelangganRow>()

  for (const row of rows) {
    const legacyId = Number(row.id)
    const parsed: PelangganRow = {
      id: legacyId,
      kode: row.kode,
      namalengkap: row.namalengkap,
      nama: row.nama,
      hp: row.hp,
      alamat: row.alamat,
      bank: row.bank,
      norek: row.norek,
      top: row.top ? Number(row.top) : null,
      plafon: row.plafon,
    }
    const name = (parsed.namalengkap || parsed.nama || "(tanpa nama)").trim() || "(tanpa nama)"

    await prisma.legacySalesClient.upsert({
      where: { legacyId },
      update: {
        kode: parsed.kode,
        name,
        phoneNumber: parsed.hp,
        address: parsed.alamat,
        bankName: parsed.bank,
        bankAccount: parsed.norek,
        paymentTermDays: parsed.top,
        creditLimit: parsed.plafon ? Number(parsed.plafon) : null,
      },
      create: {
        legacyId,
        kode: parsed.kode,
        name,
        phoneNumber: parsed.hp,
        address: parsed.alamat,
        bankName: parsed.bank,
        bankAccount: parsed.norek,
        paymentTermDays: parsed.top,
        creditLimit: parsed.plafon ? Number(parsed.plafon) : null,
      },
    })
    byLegacyId.set(legacyId, parsed)
  }
  console.log(`[migrate-sales] LegacySalesClient (m_pelanggan, staging): ${byLegacyId.size}`)
  return byLegacyId
}

/** Cari Client asli yang cocok (by phone dulu, lalu by nama persis) — kalau tidak ada, buat baru
 *  dari data pelanggan lama, ditandai legacySalesClientId supaya jelas asalnya. Di-cache per
 *  proses supaya 1 pelanggan cuma dicocokkan/dibuat sekali walau direferensikan banyak invoice. */
async function findOrCreateClientForPelanggan(pelanggan: PelangganRow, legacySalesClientDbId: string, cache: Map<number, string>) {
  const cached = cache.get(pelanggan.id)
  if (cached) return cached

  const name = (pelanggan.namalengkap || pelanggan.nama || "(tanpa nama)").trim() || "(tanpa nama)"
  const normalizedPhone = pelanggan.hp ? normalizePhoneNumber(pelanggan.hp) : null

  const alreadyLinked = await prisma.client.findUnique({ where: { legacySalesClientId: legacySalesClientDbId } })
  if (alreadyLinked) {
    cache.set(pelanggan.id, alreadyLinked.id)
    return alreadyLinked.id
  }

  let match = normalizedPhone
    ? (await prisma.client.findMany({ where: { phoneNumber: { not: null } } })).find(
        (c) => normalizePhoneNumber(c.phoneNumber!) === normalizedPhone
      )
    : undefined

  if (!match) {
    match = (await prisma.client.findMany({ where: { name: { equals: name, mode: "insensitive" } } }))[0]
  }

  if (match) {
    await prisma.client.update({ where: { id: match.id }, data: { legacySalesClientId: legacySalesClientDbId } })
    cache.set(pelanggan.id, match.id)
    return match.id
  }

  const created = await prisma.client.create({
    data: { name, phoneNumber: pelanggan.hp, address: pelanggan.alamat, legacySalesClientId: legacySalesClientDbId },
  })
  cache.set(pelanggan.id, created.id)
  return created.id
}

async function migratePiutang(pelangganByLegacyId: Map<number, PelangganRow>) {
  const rows = parseTsv(join(dataDir, "penjualan_unpaid.tsv"))

  const clientIdCache = new Map<number, string>()
  const legacySalesClientDbIdByLegacyId = new Map<number, string>()
  const staged = await prisma.legacySalesClient.findMany({ select: { id: true, legacyId: true } })
  for (const s of staged) legacySalesClientDbIdByLegacyId.set(s.legacyId, s.id)

  let count = 0
  let skipped = 0
  for (const inv of rows) {
    const legacyId = inv.id!
    const existing = await prisma.invoice.findUnique({ where: { legacyId } })
    if (existing) {
      count++
      continue
    }

    const pelangganLegacyId = Number(inv.idpelanggan)
    const pelanggan = pelangganByLegacyId.get(pelangganLegacyId)
    const legacySalesClientDbId = legacySalesClientDbIdByLegacyId.get(pelangganLegacyId)
    if (!pelanggan || !legacySalesClientDbId) {
      console.warn(`[migrate-sales] Lewati invoice ${inv.nobukti}: pelanggan idpelanggan=${inv.idpelanggan} tidak ditemukan`)
      skipped++
      continue
    }

    const clientId = await findOrCreateClientForPelanggan(pelanggan, legacySalesClientDbId, clientIdCache)
    const remaining = Number(inv.blmbayar)
    const invoiceNumber = await generateInvoiceNumber()

    await prisma.invoice.create({
      data: {
        legacyId,
        invoiceNumber,
        clientId,
        issuedAt: parseLegacyDate(inv.tglinvoice) ?? new Date(),
        dueDate: parseLegacyDate(inv.jatuhtempo),
        subtotal: remaining,
        totalAmount: remaining,
        totalCost: 0,
        status: "unpaid",
        notes: `Migrasi piutang dari aplikasi penjualan lama — no. bukti asli: ${inv.nobukti}`,
        lines: {
          create: [
            {
              description: `Migrasi piutang - ${inv.nobukti}`,
              qty: 1,
              unitPrice: remaining,
              unitCost: 0,
              discountAmount: 0,
              lineTotal: remaining,
            },
          ],
        },
      },
    })
    count++
  }
  console.log(`[migrate-sales] Invoice piutang (t_penjualan blmbayar>0): ${count} (dilewati: ${skipped})`)
}

async function main() {
  await migrateJasa()
  const pelangganByLegacyId = await migratePelangganStaging()
  await migratePiutang(pelangganByLegacyId)
  console.log("[migrate-sales] Selesai.")
}

main()
  .catch((e) => {
    console.error("[migrate-sales] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
