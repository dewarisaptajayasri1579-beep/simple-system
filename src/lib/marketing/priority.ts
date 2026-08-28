/**
 * Priority Engine — Fase 4 (belum diimplementasi). Untuk sekarang `recalcLeadPriority` sengaja
 * NO-OP: dipanggil dari titik-titik event (ubah temperatur, tambah aktivitas, selesai follow up)
 * supaya wiring-nya sudah ada; begitu Fase 4 jalan cukup isi fungsi ini tanpa ubah caller.
 *
 * Lihat `marketing-plan-to-do.md` Fase 4 (poin 25-28) & `docs/06-business-rule.md`.
 */
export async function recalcLeadPriority(_leadId: string): Promise<void> {
  // TODO Fase 4: hitung skor 0-100 dari komponen (temperatur/aktivitas/follow up/recency/AI),
  // update leads.priorityScore + priorityLevel, insert LeadPrioritySnapshot.
}
