/**
 * Seed 5 akun tujuan "Slotting Omset" (Operasional/Direksi/Cadangan Modal-HPP/Bonus/Laba
 * Ditahan-Dana Darurat) — placeholder,
 * staf tinggal edit nama/nomor rekening asli lewat Keuangan > Akun Kas & Bank setelah ini.
 * Juga set Settings.slotting*AccountId supaya menu Slotting Omset langsung bisa dipakai.
 * Aman dijalankan berulang: upsert by name.
 *
 * Jalankan: npx tsx scripts/seed-slotting.ts
 */
import { prisma } from "../src/lib/prisma"

async function ensureAccount(name: string) {
  const existing = await prisma.account.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
  if (existing) {
    console.log(`Akun "${name}" sudah ada, dipakai.`)
    return existing
  }

  const kasBankParent = await prisma.chartOfAccount.findUniqueOrThrow({ where: { code: "1-1000" } })
  const siblings = await prisma.chartOfAccount.findMany({ where: { parentId: kasBankParent.id }, select: { code: true } })
  const lastNumber = siblings.reduce((highest, sibling) => {
    const match = /^1-(\d+)$/.exec(sibling.code)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 1000)
  const coa = await prisma.chartOfAccount.create({
    data: { code: `1-${String(lastNumber + 1).padStart(4, "0")}`, name, type: "asset", parentId: kasBankParent.id },
  })

  const created = await prisma.account.create({
    data: { name, type: "bank", bankName: null, accountNumber: null, openingBalance: 0, coaAccountId: coa.id },
  })
  console.log(`Akun "${name}" dibuat (COA ${coa.code}).`)
  return created
}

async function main() {
  const operasional = await ensureAccount("Operasional (Slotting)")
  const direksi = await ensureAccount("Direksi (Slotting)")
  const bonus = await ensureAccount("Bonus Tim (Slotting)")
  const hppReserve = await ensureAccount("Cadangan Modal/HPP (Slotting)")
  const labaDitahan = await ensureAccount("Laba Ditahan/Dana Darurat (Slotting)")

  await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      slottingOperasionalAccountId: operasional.id,
      slottingDireksiAccountId: direksi.id,
      slottingBonusAccountId: bonus.id,
      slottingHppReserveAccountId: hppReserve.id,
      slottingLabaDitahanAccountId: labaDitahan.id,
    },
    create: {
      id: "default",
      slottingOperasionalAccountId: operasional.id,
      slottingDireksiAccountId: direksi.id,
      slottingBonusAccountId: bonus.id,
      slottingHppReserveAccountId: hppReserve.id,
      slottingLabaDitahanAccountId: labaDitahan.id,
    },
  })
  console.log("Settings.slotting*AccountId sudah di-set. Persentase default: 40/25/20/5/10, biaya admin Rp2.500.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
