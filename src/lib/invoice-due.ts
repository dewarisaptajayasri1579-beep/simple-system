/** Untuk client berstatus Pemungut PPN (instansi pemerintah dkk — lihat Client.isPemungutPpn),
 *  PPN pada invoice TIDAK pernah masuk kas kita: client setor PPN itu langsung ke kas negara
 *  dan kita cuma terima Bukti Pungut (Invoice.noBuktiPungutPpn). Jadi jumlah yang harus benar-
 *  benar ditagih/dianggap lunas via kas cuma DPP-nya (totalAmount - ppnAmount), BUKAN
 *  totalAmount penuh seperti invoice biasa. Semua perhitungan "sisa tagih"/status lunas WAJIB
 *  lewat fungsi ini, jangan hitung `invoice.totalAmount - paid` langsung kalau clientnya bisa
 *  Pemungut PPN. */
export function invoiceCashDue(
  invoice: { totalAmount: number; ppnAmount: number; ppnEnabled: boolean },
  isPemungutPpn: boolean
): number {
  if (isPemungutPpn && invoice.ppnEnabled) return invoice.totalAmount - invoice.ppnAmount
  return invoice.totalAmount
}
