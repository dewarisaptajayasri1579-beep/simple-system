/**
 * Seed master/lookup data modul Marketing (Simple Lead) — segments, lead sources, activity
 * types, follow-up result types, lost reasons, sesuai baseline docs/04-database.md §30.
 * Aman dijalankan berulang: upsert by code.
 *
 * Jalankan: npx tsx scripts/seed-marketing.ts
 */
import { prisma } from "../src/lib/prisma"

async function main() {
  const segments = [
    { code: "SEVENRENT", name: "SevenRent" },
    { code: "SAP", name: "SAP" },
    { code: "ABSENSI", name: "Absensi" },
    { code: "BENGKEL", name: "Bengkel" },
    { code: "GYM", name: "Gym" },
    { code: "CUSTOM_APP", name: "Custom Application" },
  ]
  for (const s of segments) {
    await prisma.segment.upsert({ where: { code: s.code }, update: { name: s.name }, create: s })
    console.log(`Segment ${s.code} - ${s.name}`)
  }

  const sources = [
    { code: "WHATSAPP", name: "WhatsApp" },
    { code: "WEBSITE", name: "Website" },
    { code: "MANUAL", name: "Manual" },
    { code: "ADS", name: "Ads" },
    { code: "REFERRAL", name: "Referral" },
  ]
  for (const s of sources) {
    await prisma.leadSource.upsert({ where: { code: s.code }, update: { name: s.name }, create: s })
    console.log(`LeadSource ${s.code} - ${s.name}`)
  }

  // score = normalized activity score (docs/06 §7): DISCUSSION 20, ZOOM_DEMO 55, PROPOSAL 75, NEGOTIATION 90.
  const activityTypes = [
    { code: "DISCUSSION", name: "Diskusi", stageRank: 1, score: 20 },
    { code: "ZOOM_DEMO", name: "Zoom/Demo", stageRank: 2, score: 55 },
    { code: "PROPOSAL", name: "Kirim Penawaran", stageRank: 3, score: 75 },
    { code: "NEGOTIATION", name: "Negosiasi", stageRank: 4, score: 90 },
  ]
  for (const a of activityTypes) {
    await prisma.leadActivityType.upsert({
      where: { code: a.code },
      update: { name: a.name, stageRank: a.stageRank, score: a.score },
      create: a,
    })
    console.log(`LeadActivityType ${a.code} - ${a.name}`)
  }

  // normalizedScore = skor 0-100 komponen Follow Up di Priority Engine (docs/06 §8).
  const followUpResultTypes = [
    { code: "REQUEST_PROPOSAL", name: "Minta Penawaran", priorityScoreEffect: 20, temperatureSignalScore: 20, normalizedScore: 100, isPositive: true },
    { code: "REQUEST_DEMO", name: "Minta Demo", priorityScoreEffect: 18, temperatureSignalScore: 18, normalizedScore: 90, isPositive: true },
    { code: "INTERESTED", name: "Tertarik", priorityScoreEffect: 15, temperatureSignalScore: 15, normalizedScore: 80, isPositive: true },
    { code: "CALL_LATER", name: "Hubungi Nanti", priorityScoreEffect: 8, temperatureSignalScore: 5, normalizedScore: 65, isPositive: true },
    { code: "INTERNAL_DISCUSSION", name: "Diskusi Internal Customer", priorityScoreEffect: 5, temperatureSignalScore: 5, normalizedScore: 60, isPositive: true },
    { code: "OTHER", name: "Lainnya", priorityScoreEffect: 0, temperatureSignalScore: 0, normalizedScore: 50, isPositive: null },
    { code: "NO_RESPONSE", name: "Tidak Ada Respon", priorityScoreEffect: -5, temperatureSignalScore: -5, normalizedScore: 30, isPositive: false },
    { code: "NOT_INTERESTED", name: "Tidak Tertarik", priorityScoreEffect: -25, temperatureSignalScore: -25, normalizedScore: 0, isPositive: false },
  ]
  for (const f of followUpResultTypes) {
    await prisma.leadFollowUpResultType.upsert({
      where: { code: f.code },
      update: {
        name: f.name,
        priorityScoreEffect: f.priorityScoreEffect,
        temperatureSignalScore: f.temperatureSignalScore,
        normalizedScore: f.normalizedScore,
        isPositive: f.isPositive,
      },
      create: f,
    })
    console.log(`LeadFollowUpResultType ${f.code} - ${f.name}`)
  }

  // Kemampuan beli — band rupiah. priorityScoreEffect = modifier flat ke Priority Score.
  const buyingPowerTiers = [
    { code: "HEMAT", name: "Hemat · < Rp5 jt", description: "Budget kecil / cari paket termurah", sortOrder: 1, normalizedScore: 20, priorityScoreEffect: -3 },
    { code: "STANDAR", name: "Standar · Rp5–20 jt", description: "UMKM / perorangan dengan anggaran wajar", sortOrder: 2, normalizedScore: 45, priorityScoreEffect: 0 },
    { code: "MENENGAH", name: "Menengah · Rp20–50 jt", description: "Perusahaan menengah / proyek serius", sortOrder: 3, normalizedScore: 70, priorityScoreEffect: 3 },
    { code: "BESAR", name: "Besar · > Rp50 jt", description: "Korporat / instansi, anggaran besar", sortOrder: 4, normalizedScore: 92, priorityScoreEffect: 6 },
  ]
  for (const b of buyingPowerTiers) {
    await prisma.leadBuyingPowerTier.upsert({
      where: { code: b.code },
      update: { name: b.name, description: b.description, sortOrder: b.sortOrder, normalizedScore: b.normalizedScore, priorityScoreEffect: b.priorityScoreEffect },
      create: b,
    })
    console.log(`LeadBuyingPowerTier ${b.code} - ${b.name}`)
  }

  const lostReasons = [
    { code: "PRICE", name: "Harga" },
    { code: "BUDGET", name: "Budget" },
    { code: "COMPETITOR", name: "Kompetitor" },
    { code: "NO_NEED", name: "Tidak Butuh" },
    { code: "NO_RESPONSE", name: "Tidak Ada Respon" },
    { code: "TIMING", name: "Waktu Tidak Tepat" },
    { code: "OTHER", name: "Lainnya" },
  ]
  for (const l of lostReasons) {
    await prisma.leadLostReason.upsert({ where: { code: l.code }, update: { name: l.name }, create: l })
    console.log(`LeadLostReason ${l.code} - ${l.name}`)
  }

  console.log("Seed Marketing selesai.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
