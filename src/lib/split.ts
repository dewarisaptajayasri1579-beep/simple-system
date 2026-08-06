export interface SplitPercentages {
  operasionalPct: number
  direksiPct: number
  bonusPct: number
}

export interface SplitResult {
  netAmount: number
  operasionalAmount: number
  direksiAmount: number
  bonusAmount: number
}

/** Net = gross - cost (cost = biaya/HPP/PPN, apapun yang bukan hak perusahaan untuk dibagi),
 *  lalu net itu yang dipecah sesuai persentase. Dipakai server-side (saat simpan transaksi)
 *  maupun client-side (preview live di form) — rumus harus identik di kedua sisi. */
export function computeSplit(grossAmount: number, cost: number, pct: SplitPercentages): SplitResult {
  // Rupiah tidak punya sub-unit yang lazim dipakai — dibulatkan ke rupiah penuh, bukan 2 desimal.
  const netAmount = Math.round(Math.max(0, grossAmount - cost))
  return {
    netAmount,
    operasionalAmount: Math.round((netAmount * pct.operasionalPct) / 100),
    direksiAmount: Math.round((netAmount * pct.direksiPct) / 100),
    bonusAmount: Math.round((netAmount * pct.bonusPct) / 100),
  }
}
