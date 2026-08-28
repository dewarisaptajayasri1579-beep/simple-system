import { recalcLeadPriority } from "@/lib/marketing/priority"
import { recomputeTemperatureSuggestion } from "@/lib/marketing/temperature"

/**
 * Hitung ulang semua "derived data" 1 lead: Priority Score + saran temperatur (SUGGEST_ONLY).
 * Dipanggil di tiap event penting (docs/06 §15, §19): pesan masuk/keluar, aktivitas baru,
 * follow up selesai, ubah temperatur/outcome, AI analysis baru. Best-effort — kegagalan tidak
 * menggagalkan aksi user.
 */
export async function recalcLeadDerived(leadId: string): Promise<void> {
  await recalcLeadPriority(leadId).catch(() => {})
  await recomputeTemperatureSuggestion(leadId).catch(() => {})
}
