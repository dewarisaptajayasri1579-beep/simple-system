/** Validasi & parsing input transaksi pekerjaan Blesscom — dipakai bareng route POST (baru) dan
 *  PATCH (edit) supaya aturannya tidak kembar di dua tempat. */

/** Yang boleh mencatat/mengubah pekerjaan Blesscom — sama dengan menu Principle. */
export const BLESSCOM_WORK_ROLES = ["owner", "admin", "direktur"]

export interface ItemInput {
  name?: string
  workPriceItemId?: string | null
  levelLabel?: string
  amount?: number
  refAmount?: number | null
}

export interface ParsedItem {
  name: string
  workPriceItemId: string | null
  levelLabel: string
  amount: number
  refAmount: number | null
  sortOrder: number
}

export function parseWorkOrderItems(raw: unknown): { items: ParsedItem[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Minimal 1 detail pekerjaan" }

  const items: ParsedItem[] = []
  for (const [i, r] of (raw as ItemInput[]).entries()) {
    const name = typeof r?.name === "string" ? r.name.trim() : ""
    const levelLabel = typeof r?.levelLabel === "string" ? r.levelLabel.trim() : ""
    const amount = Math.round(Number(r?.amount) || 0)
    if (!name) return { error: `Nama pekerjaan baris ${i + 1} wajib diisi` }
    if (!levelLabel) return { error: `Level baris ${i + 1} wajib dipilih` }
    if (amount <= 0) return { error: `Nominal baris ${i + 1} wajib lebih dari 0` }
    items.push({
      name,
      workPriceItemId: r?.workPriceItemId || null,
      levelLabel,
      amount,
      refAmount: r?.refAmount == null ? null : Math.round(Number(r.refAmount) || 0),
      sortOrder: i,
    })
  }
  return { items }
}

/** Tanggal dari input date ("YYYY-MM-DD") — dibaca sebagai tanggal WIB, bukan UTC. */
export function parseWorkDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
