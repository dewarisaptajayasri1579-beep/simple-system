export type CoaType = "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense"

export interface CoaSeedRow {
  code: string
  name: string
  type: CoaType
  parentCode: string | null
}

/** Template COA standar untuk jasa/agency — dipakai sekali oleh scripts/seed-coa.ts. */
export const COA_SEED: CoaSeedRow[] = [
  { code: "1-0000", name: "Aset", type: "asset", parentCode: null },
  { code: "1-1000", name: "Kas & Bank", type: "asset", parentCode: "1-0000" },
  { code: "1-2000", name: "Piutang Usaha", type: "asset", parentCode: "1-0000" },
  { code: "1-3000", name: "Aset Tetap", type: "asset", parentCode: "1-0000" },

  { code: "2-0000", name: "Liabilitas", type: "liability", parentCode: null },
  { code: "2-1000", name: "Hutang Usaha (Vendor)", type: "liability", parentCode: "2-0000" },
  { code: "2-2000", name: "PPN Keluaran", type: "liability", parentCode: "2-0000" },
  { code: "2-3000", name: "Hutang Biaya Berkala", type: "liability", parentCode: "2-0000" },

  { code: "3-0000", name: "Ekuitas", type: "equity", parentCode: null },
  { code: "3-1000", name: "Modal", type: "equity", parentCode: "3-0000" },
  { code: "3-2000", name: "Laba Ditahan", type: "equity", parentCode: "3-0000" },

  { code: "4-0000", name: "Pendapatan", type: "revenue", parentCode: null },
  { code: "4-1000", name: "Pendapatan Jasa", type: "revenue", parentCode: "4-0000" },
  { code: "4-2000", name: "Pendapatan Lain-lain", type: "revenue", parentCode: "4-0000" },
  { code: "4-3000", name: "Pendapatan Project", type: "revenue", parentCode: "4-0000" },

  { code: "5-0000", name: "Harga Pokok Penjualan", type: "cogs", parentCode: null },
  { code: "5-1000", name: "HPP", type: "cogs", parentCode: "5-0000" },

  { code: "6-0000", name: "Beban", type: "expense", parentCode: null },
  { code: "6-1000", name: "Beban Operasional Kantor", type: "expense", parentCode: "6-0000" },
  { code: "6-2000", name: "Beban Pribadi/Prive", type: "expense", parentCode: "6-0000" },
  { code: "6-3000", name: "Beban Lain-lain", type: "expense", parentCode: "6-0000" },
  { code: "6-4000", name: "Beban Server & Hosting", type: "expense", parentCode: "6-0000" },
  { code: "6-5000", name: "Beban Domain", type: "expense", parentCode: "6-0000" },
  { code: "6-6000", name: "Beban Maintenance", type: "expense", parentCode: "6-0000" },
]

/** Kode akun baku yang dirujuk langsung oleh journal-rules.ts. */
export const COA_CODE = {
  kasBankParent: "1-1000",
  piutangUsaha: "1-2000",
  hutangUsahaVendor: "2-1000",
  ppnKeluaran: "2-2000",
  hutangBiayaBerkala: "2-3000",
  modal: "3-1000",
  labaDitahan: "3-2000",
  pendapatanJasa: "4-1000",
  pendapatanLain: "4-2000",
  pendapatanProject: "4-3000",
  hpp: "5-1000",
  bebanKantor: "6-1000",
  bebanPribadi: "6-2000",
  bebanLain: "6-3000",
  bebanServerHosting: "6-4000",
  bebanDomain: "6-5000",
  bebanMaintenance: "6-6000",
} as const

/** RecurringBill.category ("kantor" | "pribadi" | "lainnya") -> kode akun beban. */
export function bebanCodeForCategory(category: string): string {
  if (category === "kantor") return COA_CODE.bebanKantor
  if (category === "pribadi") return COA_CODE.bebanPribadi
  return COA_CODE.bebanLain
}
