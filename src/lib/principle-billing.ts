import { jakartaTodayDateIso } from "@/lib/datetime"

export interface PrincipleTierInput {
  label: string
  fromCount: number
  toCount: number | null
  unitPrice: number
}

export interface PrincipleChargeLine {
  label: string
  qty: number
  unitPrice: number
  total: number
}

/** "YYYY-MM" yang dipakai semua menu Blesscom — default bulan berjalan (Jakarta). */
export function resolvePrincipleMonth(bulan?: string | null) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan ?? "") ? bulan! : jakartaTodayDateIso().slice(0, 7)
}

/** Label Indonesia buat "YYYY-MM", mis. "Oktober 2026". */
export function principleMonthLabel(monthIso: string) {
  const [y, m] = monthIso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })
}

/** Akhir bulan (23:59:59 WIB) dari "YYYY-MM". */
export function principleMonthEnd(monthIso: string) {
  const [y, m] = monthIso.split("-").map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return new Date(`${monthIso}-${String(lastDay).padStart(2, "0")}T23:59:59+07:00`)
}

/**
 * Apakah principle ini ikut ditagih di bulan `monthIso`?
 *
 * Aturannya (keputusan Owner): principle TIDAK ditagih mulai BULAN tanggal non-aktifnya — bukan
 * pro-rata, bukan ditagih penuh dulu. Jadi non-aktif 10 Okt → invoice Oktober sudah tanpa dia,
 * tapi invoice September (kalau digenerate belakangan) masih menghitungnya.
 *
 * Catatan keterbatasan yang disengaja: sistem cuma menyimpan SATU tanggal non-aktif terakhir,
 * tidak ada riwayat aktif-nonaktif-aktif-lagi. Principle yang diaktifkan kembali kehilangan
 * jejak periode matinya (deactivatedAt dikosongkan) — cukup untuk kebutuhan tagihan bulan
 * berjalan, dan menghindari tabel riwayat yang tidak akan pernah dipakai staf.
 */
export function isPrincipleBillableForMonth(
  principle: { active: boolean; deactivatedAt: Date | null },
  monthIso: string,
) {
  if (principle.active) return true
  if (!principle.deactivatedAt) return false
  return principle.deactivatedAt > principleMonthEnd(monthIso)
}

/**
 * Pecah `count` principle jadi baris-baris invoice sesuai tabel tingkatan harga — BERTINGKAT
 * (marginal), persis seperti invoice Blesscom yang sudah jalan: "10 Pertama" qty 10 @500rb +
 * "11 ke atas" qty sisanya @400rb. Tier yang tidak kena sama sekali (qty 0) dibuang supaya
 * invoice tidak punya baris nol.
 */
export function computePrincipleCharge(count: number, tiers: PrincipleTierInput[]): PrincipleChargeLine[] {
  if (count <= 0) return []
  return [...tiers]
    .sort((a, b) => a.fromCount - b.fromCount)
    .map((t) => {
      const upper = t.toCount == null ? count : Math.min(count, t.toCount)
      const qty = Math.max(0, upper - t.fromCount + 1)
      return { label: t.label, qty, unitPrice: t.unitPrice, total: qty * t.unitPrice }
    })
    .filter((l) => l.qty > 0)
}

/** Total tagihan dari hasil computePrincipleCharge. */
export function sumPrincipleCharge(lines: PrincipleChargeLine[]) {
  return lines.reduce((s, l) => s + l.total, 0)
}
