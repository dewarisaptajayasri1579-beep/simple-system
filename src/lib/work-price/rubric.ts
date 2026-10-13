/**
 * Rubrik bobot pekerjaan — 8 parameter universal yang menentukan berat-ringannya sebuah
 * pekerjaan custom, berlaku untuk kategori apa pun (termasuk request yang belum ada
 * kategorinya di Acuan Level).
 *
 * Dasarnya: SEMUA harga di pricelist ini kelipatan Rp47.500, dan 1 poin = Rp95.000 (harga lama
 * Rp100.000 didiskon 5%). Jadi pricelist-nya memang sudah berbasis bobot sejak awal — rubrik ini
 * cuma mengeksplisitkan rumus dari pekerjaan ke poin. Nilai tiap opsi dikalibrasi dari harga
 * pekerjaan yang sudah pernah dijual (lihat scripts/calc-work-weight.ts).
 */

/** 1 poin bobot = Rp95.000. Kalau tarif naik, ubah di sini lalu jalankan ulang
 *  `npx tsx scripts/calc-work-weight.ts --apply` supaya semua harga item ikut menyesuaikan. */
export const POINT_VALUE_IDR = 95_000

export const RUBRIC = {
  P1: {
    name: "Layar/halaman yang dibuat atau diubah",
    question: "Kira-kira berapa halaman/layar yang perlu dibuat atau diubah?",
    options: [
      { code: "none", label: "Tidak ada layar baru/diubah", points: 0 },
      { code: "one", label: "1 layar", points: 0.5 },
      { code: "few", label: "2-3 layar", points: 1.5 },
      { code: "many", label: "4 layar atau lebih", points: 3 },
    ],
  },
  P2: {
    name: "Jenis data yang terlibat (dibuat, diubah, atau digabung)",
    question: "Data apa saja yang disimpan atau digabung? Kira-kira berapa jenis/tabel?",
    options: [
      { code: "none", label: "Tidak menyentuh data", points: 0 },
      { code: "one", label: "1 jenis data", points: 1 },
      { code: "few", label: "2-3 jenis data", points: 2 },
      { code: "many", label: "4 jenis data atau lebih", points: 3 },
    ],
  },
  P3: {
    name: "Aturan & perhitungan",
    question: "Ada perhitungan atau aturan khusus di dalamnya?",
    options: [
      { code: "none", label: "Tidak ada", points: 0 },
      { code: "simple", label: "Rumus/validasi sederhana", points: 1 },
      { code: "conditional", label: "Aturan bersyarat (kalau A maka B)", points: 2 },
      { code: "complex", label: "Banyak aturan bertingkat & saling terkait", points: 4 },
    ],
  },
  P4: {
    name: "Alur status & persetujuan",
    question: "Perlu alur persetujuan atau status bertingkat sebelum data final?",
    options: [
      { code: "none", label: "Tidak ada", points: 0 },
      { code: "status", label: "Status sederhana (draft/final)", points: 1 },
      { code: "approval", label: "Persetujuan berjenjang", points: 3 },
    ],
  },
  P5: {
    name: "Hubungan ke sistem luar",
    question: "Perlu nyambung ke luar — WhatsApp, payment, Excel, atau API lain?",
    options: [
      { code: "none", label: "Tidak ada", points: 0 },
      { code: "file", label: "Import/export file, atau pakai integrasi yang sudah ada", points: 1 },
      { code: "oneway", label: "Kirim ke layanan luar (searah)", points: 3 },
      { code: "twoway", label: "Dua arah / callback / webhook", points: 6 },
    ],
  },
  P6: {
    name: "Dampak ke fitur yang sudah jalan",
    question: "Ini fitur baru yang berdiri sendiri, atau mengubah yang sudah jalan?",
    options: [
      { code: "none", label: "Berdiri sendiri / perubahan terisolasi", points: 0 },
      { code: "one", label: "1 fitur lain ikut terpengaruh", points: 1 },
      { code: "many", label: "2 fitur/modul atau lebih ikut terpengaruh", points: 3 },
    ],
  },
  P7: {
    name: "Risiko kalau salah",
    question: "Kalau hasilnya salah, dampaknya ke apa?",
    options: [
      { code: "display", label: "Cuma tampilan, tidak ada kerugian", points: 0 },
      { code: "master", label: "Data master, perlu perbaikan data", points: 0.5 },
      { code: "money", label: "Menyentuh uang/stok/saldo", points: 3 },
    ],
  },
  P8: {
    name: "Desain tampilan",
    question: "Tampilannya ikut pola yang sudah ada, atau dirancang baru?",
    options: [
      { code: "reuse", label: "Pakai pola tampilan yang sudah ada", points: 0 },
      { code: "adjust", label: "Sesuaikan pola yang ada", points: 1 },
      { code: "scratch", label: "Rancang tampilan dari nol", points: 3 },
    ],
  },
} as const

export type ParameterCode = keyof typeof RUBRIC
export const PARAMETER_CODES = Object.keys(RUBRIC) as ParameterCode[]

/** Skor satu pekerjaan: kode opsi yang dipilih untuk tiap parameter, mis. { P1: "one", ... }. */
export type WeightScores = Record<ParameterCode, string>

export function pointsForOption(code: ParameterCode, optionCode: string): number {
  const found = RUBRIC[code].options.find((o) => o.code === optionCode)
  return found?.points ?? 0
}

export function labelForOption(code: ParameterCode, optionCode: string): string {
  const found = RUBRIC[code].options.find((o) => o.code === optionCode)
  return found?.label ?? "-"
}

export function totalPoints(scores: Partial<WeightScores>): number {
  return PARAMETER_CODES.reduce((sum, code) => {
    const optionCode = scores[code]
    return sum + (optionCode ? pointsForOption(code, optionCode) : 0)
  }, 0)
}

export function priceFromPoints(points: number): number {
  return Math.round(points * POINT_VALUE_IDR)
}

/** Dipakai AI & UI: daftar opsi valid tiap parameter, buat enum JSON schema dan dropdown. */
export function optionCodes(code: ParameterCode): string[] {
  return RUBRIC[code].options.map((o) => o.code)
}
