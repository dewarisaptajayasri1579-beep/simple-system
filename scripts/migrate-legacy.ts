/**
 * Migrasi sekali-jalan dari database aplikasi lama (CodeIgniter + MySQL, server produksi)
 * ke Postgres sistem baru. Aman dijalankan berulang kali — tiap model migrasi punya kolom
 * `legacyId` unik, jadi dipakai `upsert` (bukan `create`), tidak akan menduplikasi data.
 *
 * Jalankan dari root project: `npm run migrate:legacy`
 * Butuh env var (lihat .env.example): LEGACY_SSH_HOST/USER/PASSWORD, LEGACY_DB_NAME/USER/PASSWORD.
 *
 * Urutan migrasi mengikuti dependensi foreign key: master data tanpa dependensi dulu
 * (Vendor, BillingPeriod, CloudType, HostingPackage, Client), baru yang bergantung padanya
 * (Server, CpanelAccount, Domain, Subdomain, RecurringBill).
 */
import { Client as SshClient } from "ssh2"
import mysql from "mysql2/promise"

import { prisma } from "../src/lib/prisma"

const SSH_HOST = requireEnv("LEGACY_SSH_HOST")
const SSH_USER = requireEnv("LEGACY_SSH_USER")
const SSH_PASSWORD = requireEnv("LEGACY_SSH_PASSWORD")
const DB_NAME = requireEnv("LEGACY_DB_NAME")
const DB_USER = requireEnv("LEGACY_DB_USER")
const DB_PASSWORD = requireEnv("LEGACY_DB_PASSWORD")

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Env var ${name} belum di-set (lihat .env.example)`)
  return value
}

/** Field FK di tabel lama bertipe varchar(36)/char(36) tapi isinya cuma id integer sebagai
 *  string (mis. "13"), bukan UUID sungguhan — technical debt dari aplikasi lama. Kosong/"0"
 *  dianggap tidak ada relasi. */
function parseLegacyIntId(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const str = String(raw).trim()
  if (!str || str === "0") return null
  const n = Number(str)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** MySQL "0000-00-00" (tanggal kosong ala legacy) harus jadi null, bukan Invalid Date. */
function parseLegacyDate(raw: unknown): Date | null {
  if (!raw) return null
  const str = String(raw)
  if (str.startsWith("0000-00-00")) return null
  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseLegacyActive(ytaktif: unknown): boolean {
  // Data lama campur ("Y"/"T"/"1"/"0") — "0" eksplisit satu-satunya penanda pasti nonaktif,
  // sisanya default aktif (staf bisa nonaktifkan manual lewat UI kalau ternyata sudah tidak
  // dipakai — lebih aman daripada menyembunyikan data yang masih relevan).
  return String(ytaktif ?? "").trim() !== "0"
}

async function connectLegacyDb() {
  const ssh = new SshClient()

  await new Promise<void>((resolve, reject) => {
    ssh.on("ready", resolve)
    ssh.on("error", reject)
    ssh.connect({ host: SSH_HOST, username: SSH_USER, password: SSH_PASSWORD })
  })
  console.log(`[migrate] SSH tersambung ke ${SSH_HOST}`)

  const stream = await new Promise<import("ssh2").ClientChannel>((resolve, reject) => {
    ssh.forwardOut("127.0.0.1", 0, "127.0.0.1", 3306, (err, stream) => {
      if (err) reject(err)
      else resolve(stream)
    })
  })

  const connection = await mysql.createConnection({
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
    stream,
  } as mysql.ConnectionOptions)
  console.log(`[migrate] Terhubung ke database MySQL "${DB_NAME}" lewat SSH tunnel`)

  return { ssh, connection }
}

async function migrateVendors(db: mysql.Connection) {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    "SELECT id, nama, linkwebsite FROM m_vendor WHERE isdeleted = 0 OR isdeleted IS NULL"
  )
  const map = new Map<number, string>()
  for (const row of rows) {
    const record = await prisma.vendor.upsert({
      where: { legacyId: row.id },
      update: { name: row.nama ?? "(tanpa nama)", website: row.linkwebsite || null },
      create: { legacyId: row.id, name: row.nama ?? "(tanpa nama)", website: row.linkwebsite || null },
    })
    map.set(row.id, record.id)
  }
  console.log(`[migrate] Vendor: ${map.size}`)
  return map
}

async function migrateBillingPeriods(db: mysql.Connection) {
  const [rows] = await db.query<mysql.RowDataPacket[]>("SELECT id, nama, reminder FROM m_periodiklangganan")
  const map = new Map<number, string>()
  for (const row of rows) {
    const record = await prisma.billingPeriod.upsert({
      where: { legacyId: row.id },
      update: { name: row.nama, reminderDaysBefore: row.reminder ?? 7 },
      create: { legacyId: row.id, name: row.nama, reminderDaysBefore: row.reminder ?? 7 },
    })
    map.set(row.id, record.id)
  }
  console.log(`[migrate] BillingPeriod: ${map.size}`)
  return map
}

async function migrateCloudTypes(db: mysql.Connection) {
  const [rows] = await db.query<mysql.RowDataPacket[]>("SELECT id, nama FROM m_jeniscloud")
  const map = new Map<number, string>()
  for (const row of rows) {
    const record = await prisma.cloudType.upsert({
      where: { legacyId: row.id },
      update: { name: row.nama ?? "(tanpa nama)" },
      create: { legacyId: row.id, name: row.nama ?? "(tanpa nama)" },
    })
    map.set(row.id, record.id)
  }
  console.log(`[migrate] CloudType: ${map.size}`)
  return map
}

async function migrateHostingPackages(db: mysql.Connection) {
  const [rows] = await db.query<mysql.RowDataPacket[]>("SELECT id, nama FROM m_packagecpanel")
  const map = new Map<number, string>()
  for (const row of rows) {
    const record = await prisma.hostingPackage.upsert({
      where: { legacyId: row.id },
      update: { name: row.nama ?? "(tanpa nama)" },
      create: { legacyId: row.id, name: row.nama ?? "(tanpa nama)" },
    })
    map.set(row.id, record.id)
  }
  console.log(`[migrate] HostingPackage: ${map.size}`)
  return map
}

async function migrateClients(db: mysql.Connection) {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    "SELECT id, nama, email, notelp_client, penanggungjawab, notelp_penanggungjawab, kota, alamat FROM m_client WHERE isdeleted = 0 OR isdeleted IS NULL"
  )
  const map = new Map<number, string>()
  for (const row of rows) {
    const record = await prisma.client.upsert({
      where: { legacyId: row.id },
      update: {
        name: row.nama ?? "(tanpa nama)",
        email: row.email || null,
        phoneNumber: row.notelp_client || null,
        picName: row.penanggungjawab || null,
        picPhone: row.notelp_penanggungjawab || null,
        city: row.kota || null,
        address: row.alamat || null,
      },
      create: {
        legacyId: row.id,
        name: row.nama ?? "(tanpa nama)",
        email: row.email || null,
        phoneNumber: row.notelp_client || null,
        picName: row.penanggungjawab || null,
        picPhone: row.notelp_penanggungjawab || null,
        city: row.kota || null,
        address: row.alamat || null,
      },
    })
    map.set(row.id, record.id)
  }
  console.log(`[migrate] Client: ${map.size}`)
  return map
}

async function migrateServers(
  db: mysql.Connection,
  vendorMap: Map<number, string>,
  cloudTypeMap: Map<number, string>,
  periodMap: Map<number, string>
) {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT id, nama, ipaddress, idvendor, idjeniscloud, core, ram, storage, dnsserver1, dnsserver2,
            tglberlangganan, tglbulanan, idperiode, jmlperiodelangganan, price, tglterakhirbayar, ytaktif
     FROM m_server WHERE isdeleted = 0 OR isdeleted IS NULL`
  )
  let count = 0
  for (const row of rows) {
    const vendorLegacyId = parseLegacyIntId(row.idvendor)
    const cloudTypeLegacyId = parseLegacyIntId(row.idjeniscloud)
    const periodLegacyId = parseLegacyIntId(row.idperiode)

    await prisma.server.upsert({
      where: { legacyId: row.id },
      update: {
        name: row.nama ?? "(tanpa nama)",
        ipAddress: row.ipaddress || null,
        vendorId: vendorLegacyId ? vendorMap.get(vendorLegacyId) : null,
        cloudTypeId: cloudTypeLegacyId ? cloudTypeMap.get(cloudTypeLegacyId) : null,
        core: row.core || null,
        ram: row.ram || null,
        storage: row.storage || null,
        dnsServer1: row.dnsserver1 || null,
        dnsServer2: row.dnsserver2 || null,
        subscriptionStart: parseLegacyDate(row.tglberlangganan),
        billingDayOfMonth: row.tglbulanan || null,
        periodId: periodLegacyId ? periodMap.get(periodLegacyId) : null,
        periodCount: row.jmlperiodelangganan || null,
        price: row.price ? Number(row.price) : null,
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        active: parseLegacyActive(row.ytaktif),
        legacyActiveFlag: row.ytaktif ?? null,
      },
      create: {
        legacyId: row.id,
        name: row.nama ?? "(tanpa nama)",
        ipAddress: row.ipaddress || null,
        vendorId: vendorLegacyId ? vendorMap.get(vendorLegacyId) : null,
        cloudTypeId: cloudTypeLegacyId ? cloudTypeMap.get(cloudTypeLegacyId) : null,
        core: row.core || null,
        ram: row.ram || null,
        storage: row.storage || null,
        dnsServer1: row.dnsserver1 || null,
        dnsServer2: row.dnsserver2 || null,
        subscriptionStart: parseLegacyDate(row.tglberlangganan),
        billingDayOfMonth: row.tglbulanan || null,
        periodId: periodLegacyId ? periodMap.get(periodLegacyId) : null,
        periodCount: row.jmlperiodelangganan || null,
        price: row.price ? Number(row.price) : null,
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        active: parseLegacyActive(row.ytaktif),
        legacyActiveFlag: row.ytaktif ?? null,
      },
    })
    count++
  }
  console.log(`[migrate] Server: ${count}`)
}

async function migrateCpanelAccounts(
  db: mysql.Connection,
  cloudTypeMap: Map<number, string>,
  packageMap: Map<number, string>
) {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    "SELECT id, nama, username, password, idcloud, idpackage FROM m_akuncpanel WHERE isdeleted = 0 OR isdeleted IS NULL"
  )
  const map = new Map<number, string>()
  for (const row of rows) {
    const cloudTypeLegacyId = parseLegacyIntId(row.idcloud)
    const packageLegacyId = parseLegacyIntId(row.idpackage)
    const record = await prisma.cpanelAccount.upsert({
      where: { legacyId: row.id },
      update: {
        name: row.nama ?? "(tanpa nama)",
        username: row.username || null,
        password: row.password || null,
        cloudTypeId: cloudTypeLegacyId ? cloudTypeMap.get(cloudTypeLegacyId) : null,
        packageId: packageLegacyId ? packageMap.get(packageLegacyId) : null,
      },
      create: {
        legacyId: row.id,
        name: row.nama ?? "(tanpa nama)",
        username: row.username || null,
        password: row.password || null,
        cloudTypeId: cloudTypeLegacyId ? cloudTypeMap.get(cloudTypeLegacyId) : null,
        packageId: packageLegacyId ? packageMap.get(packageLegacyId) : null,
      },
    })
    map.set(row.id, record.id)
  }
  console.log(`[migrate] CpanelAccount: ${map.size}`)
  return map
}

async function migrateDomains(db: mysql.Connection, clientMap: Map<number, string>, cpanelMap: Map<number, string>) {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT id, nama, idclient, idakucpanel, hargajual, tglaktif, tglterakhirbayar, ytaktif
     FROM m_domain WHERE isdeleted = 0 OR isdeleted IS NULL`
  )
  const map = new Map<number, string>()
  for (const row of rows) {
    const clientLegacyId = parseLegacyIntId(row.idclient)
    const cpanelLegacyId = parseLegacyIntId(row.idakucpanel)
    const record = await prisma.domain.upsert({
      where: { legacyId: row.id },
      update: {
        name: row.nama ?? "(tanpa nama)",
        clientId: clientLegacyId ? clientMap.get(clientLegacyId) : null,
        cpanelAccountId: cpanelLegacyId ? cpanelMap.get(cpanelLegacyId) : null,
        sellPrice: row.hargajual ? Number(row.hargajual) : null,
        activatedAt: parseLegacyDate(row.tglaktif),
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        legacyActiveFlag: row.ytaktif ?? null,
      },
      create: {
        legacyId: row.id,
        name: row.nama ?? "(tanpa nama)",
        clientId: clientLegacyId ? clientMap.get(clientLegacyId) : null,
        cpanelAccountId: cpanelLegacyId ? cpanelMap.get(cpanelLegacyId) : null,
        sellPrice: row.hargajual ? Number(row.hargajual) : null,
        activatedAt: parseLegacyDate(row.tglaktif),
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        legacyActiveFlag: row.ytaktif ?? null,
      },
    })
    map.set(row.id, record.id)
  }
  console.log(`[migrate] Domain: ${map.size}`)
  return map
}

async function migrateSubdomains(db: mysql.Connection, domainMap: Map<number, string>, clientMap: Map<number, string>) {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT id, iddomain, nama, idclient, hargajual, tglaktif, tglterakhirbayar, ytaktif
     FROM m_subdomain WHERE isdeleted = 0 OR isdeleted IS NULL`
  )
  let count = 0
  for (const row of rows) {
    const domainLegacyId = parseLegacyIntId(row.iddomain)
    const clientLegacyId = parseLegacyIntId(row.idclient)
    await prisma.subdomain.upsert({
      where: { legacyId: row.id },
      update: {
        name: row.nama ?? "(tanpa nama)",
        domainId: domainLegacyId ? domainMap.get(domainLegacyId) : null,
        clientId: clientLegacyId ? clientMap.get(clientLegacyId) : null,
        sellPrice: row.hargajual ? Number(row.hargajual) : null,
        activatedAt: parseLegacyDate(row.tglaktif),
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        legacyActiveFlag: row.ytaktif ?? null,
      },
      create: {
        legacyId: row.id,
        name: row.nama ?? "(tanpa nama)",
        domainId: domainLegacyId ? domainMap.get(domainLegacyId) : null,
        clientId: clientLegacyId ? clientMap.get(clientLegacyId) : null,
        sellPrice: row.hargajual ? Number(row.hargajual) : null,
        activatedAt: parseLegacyDate(row.tglaktif),
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        legacyActiveFlag: row.ytaktif ?? null,
      },
    })
    count++
  }
  console.log(`[migrate] Subdomain: ${count}`)
}

async function migrateRecurringBills(db: mysql.Connection, vendorMap: Map<number, string>, periodMap: Map<number, string>) {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT id, nama, idvendor, tglberlangganan, tglbulanan, jmlperiodelangganan, idperiode, price, tglterakhirbayar, ytaktif
     FROM m_biayabulanan WHERE isdeleted = 0 OR isdeleted IS NULL`
  )
  let count = 0
  for (const row of rows) {
    const vendorLegacyId = parseLegacyIntId(row.idvendor)
    const periodLegacyId = parseLegacyIntId(row.idperiode)
    await prisma.recurringBill.upsert({
      where: { legacyId: row.id },
      update: {
        name: row.nama ?? "(tanpa nama)",
        vendorId: vendorLegacyId ? vendorMap.get(vendorLegacyId) : null,
        subscriptionStart: parseLegacyDate(row.tglberlangganan),
        billingDayOfMonth: row.tglbulanan || null,
        periodId: periodLegacyId ? periodMap.get(periodLegacyId) : null,
        periodCount: row.jmlperiodelangganan || null,
        price: row.price ? Number(row.price) : null,
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        active: parseLegacyActive(row.ytaktif),
      },
      create: {
        legacyId: row.id,
        name: row.nama ?? "(tanpa nama)",
        vendorId: vendorLegacyId ? vendorMap.get(vendorLegacyId) : null,
        subscriptionStart: parseLegacyDate(row.tglberlangganan),
        billingDayOfMonth: row.tglbulanan || null,
        periodId: periodLegacyId ? periodMap.get(periodLegacyId) : null,
        periodCount: row.jmlperiodelangganan || null,
        price: row.price ? Number(row.price) : null,
        lastPaidAt: parseLegacyDate(row.tglterakhirbayar),
        active: parseLegacyActive(row.ytaktif),
      },
    })
    count++
  }
  console.log(`[migrate] RecurringBill: ${count}`)
}

async function main() {
  const { ssh, connection } = await connectLegacyDb()

  try {
    const vendorMap = await migrateVendors(connection)
    const periodMap = await migrateBillingPeriods(connection)
    const cloudTypeMap = await migrateCloudTypes(connection)
    const packageMap = await migrateHostingPackages(connection)
    const clientMap = await migrateClients(connection)

    await migrateServers(connection, vendorMap, cloudTypeMap, periodMap)
    const cpanelMap = await migrateCpanelAccounts(connection, cloudTypeMap, packageMap)
    const domainMap = await migrateDomains(connection, clientMap, cpanelMap)
    await migrateSubdomains(connection, domainMap, clientMap)
    await migrateRecurringBills(connection, vendorMap, periodMap)

    console.log("[migrate] Selesai.")
  } finally {
    await connection.end()
    ssh.end()
  }
}

main()
  .catch((e) => {
    console.error("[migrate] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
