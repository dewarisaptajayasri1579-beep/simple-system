/**
 * Seed Chart of Accounts standar + backfill Account.coaAccountId untuk semua kas/bank Account
 * yang sudah ada (masing-masing dibuatkan akun anak di bawah "1-1000 Kas & Bank").
 * Aman dijalankan berulang: upsert by code untuk COA, dan cuma mem-backfill Account yang
 * coaAccountId-nya masih kosong.
 *
 * Jalankan: npx tsx scripts/seed-coa.ts
 */
import { prisma } from "../src/lib/prisma"
import { COA_SEED, COA_CODE } from "../src/lib/accounting/coa-seed"

async function main() {
  const codeToId = new Map<string, string>()

  // Urutan COA_SEED sudah parent-dulu (tiap parentCode sudah ada duluan sebelum anaknya).
  for (const row of COA_SEED) {
    const parentId = row.parentCode ? codeToId.get(row.parentCode) : null
    const account = await prisma.chartOfAccount.upsert({
      where: { code: row.code },
      update: { name: row.name, type: row.type, parentId: parentId ?? null },
      create: { code: row.code, name: row.name, type: row.type, parentId: parentId ?? null },
    })
    codeToId.set(row.code, account.id)
    console.log(`COA ${row.code} - ${row.name}`)
  }

  const kasBankParentId = codeToId.get(COA_CODE.kasBankParent)!
  const unmapped = await prisma.account.findMany({ where: { coaAccountId: null } })
  let seq = await prisma.chartOfAccount.count({ where: { parentId: kasBankParentId } })

  for (const acc of unmapped) {
    seq += 1
    const code = `1-1${String(seq).padStart(3, "0")}`
    const coa = await prisma.chartOfAccount.create({
      data: { code, name: acc.name, type: "asset", parentId: kasBankParentId },
    })
    await prisma.account.update({ where: { id: acc.id }, data: { coaAccountId: coa.id } })
    console.log(`Mapped Account "${acc.name}" -> COA ${code}`)
  }

  console.log(`\nDone. ${COA_SEED.length} COA rows seeded, ${unmapped.length} kas/bank account(s) mapped.`)
}

main().finally(() => prisma.$disconnect())
