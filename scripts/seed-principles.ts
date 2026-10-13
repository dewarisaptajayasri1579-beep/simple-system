/**
 * Seed awal menu Blesscom — perusahaan (Blesscom & Blessfull), tingkatan harganya, dan daftar
 * principle sesuai data yang dikirim Owner (ayu.md).
 *
 * Idempoten: dijalankan ulang tidak membuat duplikat (cocok by nama), cuma melengkapi link
 * aplikasi/status yang belum ada. Harga & status yang sudah diubah dari UI TIDAK ditimpa.
 *
 * Jalankan: npx tsx scripts/seed-principles.ts
 */
import { prisma } from "@/lib/prisma"

interface SeedPrinciple {
  name: string
  appUrl: string
  active: boolean
}

/** Tingkatan harga: Blesscom bertingkat (1–10 @500rb, 11+ @400rb) sesuai invoice yang sudah
 *  jalan; Blessfull flat @400rb sejak principle pertama (lihat INV/2026/00286: 4 × 400rb). */
const COMPANIES: {
  name: string
  clientName: string
  tiers: { label: string; fromCount: number; toCount: number | null; unitPrice: number }[]
  principles: SeedPrinciple[]
}[] = [
  {
    name: "Blesscom",
    clientName: "PT. BLESSCOM",
    tiers: [
      { label: "Over Principle 10 Pertama", fromCount: 1, toCount: 10, unitPrice: 500000 },
      { label: "Over Principle 11 ke atas", fromCount: 11, toCount: null, unitPrice: 400000 },
    ],
    principles: [
      { name: "Dulux", appUrl: "dulux.blesscomapps.com", active: true },
      { name: "Sika", appUrl: "sika.blesscomapps.com", active: true },
      { name: "Gdritelindo", appUrl: "gdritelindo.blesscomapps.com", active: true },
      { name: "Gently Baby Care", appUrl: "gentlybabycare.blesscomapps.com", active: true },
      { name: "Blesscom-Event", appUrl: "blesscom-event.blesscomapps.com", active: true },
      { name: "Campina", appUrl: "campina.blesscomapps.com", active: true },
      { name: "Campina Survey", appUrl: "campina-survey.blesscomapps.com", active: true },
      { name: "Montiss", appUrl: "systemmontiss.blesscomapps.com", active: true },
      { name: "Himalaya SMD", appUrl: "himalaya-smd.blesscomapps.com", active: true },
      { name: "Kalbe-Motoris", appUrl: "kalbe-motoris.blesscomapps.com", active: true },
      { name: "Kalbe SPG MT", appUrl: "kalbe-spg-mt.blesscomapps.com", active: true },
      { name: "Meiji-MD", appUrl: "meiji-md.blesscomapps.com", active: true },
      { name: "Sukanda-Jaya", appUrl: "sukandajaya.blesscomapps.com", active: true },
      { name: "Ultrajaya", appUrl: "ultrajaya.blesscomapps.com", active: true },
      { name: "Indordesa-CRM", appUrl: "indordesa-crm.blesscomapps.com", active: true },
      { name: "Marketama Indah", appUrl: "marketama-indah.blesscomapps.com", active: true },
      { name: "You C1000", appUrl: "youc1000.blesscomapps.com", active: true },
      { name: "Kalbe-MD", appUrl: "kalbe-md.blesscomapps.com", active: false },
      { name: "Kalbe-DTC", appUrl: "kalbe-dtc.blesscomapps.com", active: false },
      { name: "Sugus", appUrl: "sugus.blesscomapps.com", active: true },
      { name: "Blescom-SMD", appUrl: "gendes.blesscomapps.com", active: true },
      { name: "Absensi Blesscom", appUrl: "absensi.blesscomapps.com", active: false },
      { name: "Recruitment Blesscom", appUrl: "recruitment.blesscomapps.com", active: false },
      { name: "Company Profil Blesscom", appUrl: "blesscom.co.id", active: false },
      { name: "Mars Motoris", appUrl: "mars-motoris.blesscomapps.com", active: true },
      { name: "SMD Ovaltine", appUrl: "ovaltine-smd.blesscomapps.com", active: true },
      { name: "Sosro", appUrl: "sosro.blesscomapps.com", active: true },
      { name: "USFI", appUrl: "usfi.blesscomapps.com", active: false },
      { name: "Japfa", appUrl: "Japfa.Blesscomapps.com", active: false },
      { name: "Japfa-Motoris", appUrl: "Japfa-Motoris.Blesscomapps.com", active: true },
      { name: "Kalbe SPG Kelontong", appUrl: "Kalbe-SPGkelontong.Blesscomapps.com", active: true },
      { name: "Sampling/Whiskas", appUrl: "Whiskas.blesscomapps.com", active: true },
    ],
  },
  {
    name: "Blessfull",
    clientName: "Blessfull Cahaya Lestari",
    tiers: [{ label: "Over Principle Aktif", fromCount: 1, toCount: null, unitPrice: 400000 }],
    principles: [
      { name: "PT Suprama", appUrl: "ptsuprama.blesscomapps.com", active: false },
      { name: "Galenium", appUrl: "gelenium.blesscomapps.com", active: true },
      { name: "MSBI", appUrl: "msbi.blesscomapps.com", active: true },
      { name: "Mahkota Prima Mandiri", appUrl: "mahkota-prima-mandiri.blesscomapps.com", active: false },
      { name: "Tong-Tji", appUrl: "Tong-tji.blesscomapps.com", active: true },
      { name: "Cimory", appUrl: "Cimory.blesscomapps.com", active: true },
    ],
  },
]

async function main() {
  for (const seed of COMPANIES) {
    const client = await prisma.client.findFirst({ where: { name: seed.clientName }, select: { id: true, name: true } })
    if (!client) console.warn(`! Client "${seed.clientName}" tidak ditemukan — perusahaan dibuat tanpa tautan client.`)

    let company = await prisma.principleCompany.findFirst({ where: { name: seed.name } })
    if (!company) {
      company = await prisma.principleCompany.create({ data: { name: seed.name, clientId: client?.id ?? null } })
      console.log(`+ Perusahaan ${seed.name} (client: ${client?.name ?? "-"})`)
    } else if (!company.clientId && client) {
      company = await prisma.principleCompany.update({ where: { id: company.id }, data: { clientId: client.id } })
      console.log(`~ Perusahaan ${seed.name}: client ditautkan ke ${client.name}`)
    }

    const tierCount = await prisma.principlePriceTier.count({ where: { companyId: company.id } })
    if (tierCount === 0) {
      await prisma.principlePriceTier.createMany({
        data: seed.tiers.map((t) => ({ ...t, companyId: company!.id })),
      })
      console.log(`+ ${seed.tiers.length} tingkatan harga untuk ${seed.name}`)
    } else {
      console.log(`= Tingkatan harga ${seed.name} sudah ada (${tierCount}) — tidak ditimpa`)
    }

    let added = 0
    let updated = 0
    for (const [i, p] of seed.principles.entries()) {
      const existing = await prisma.principle.findFirst({ where: { companyId: company.id, name: p.name } })
      if (!existing) {
        await prisma.principle.create({
          data: {
            companyId: company.id,
            name: p.name,
            appUrl: p.appUrl,
            active: p.active,
            // Tanggal non-aktifnya tidak ada di data awal — dibiarkan null; artinya principle ini
            // tidak ditagih di bulan apa pun sampai staf mengisi tanggalnya dari UI (lihat
            // isPrincipleBillableForMonth).
            sortOrder: i + 1,
          },
        })
        added++
      } else if (!existing.appUrl && p.appUrl) {
        await prisma.principle.update({ where: { id: existing.id }, data: { appUrl: p.appUrl } })
        updated++
      }
    }
    console.log(`  principle ${seed.name}: +${added} baru, ~${updated} dilengkapi, total seed ${seed.principles.length}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
