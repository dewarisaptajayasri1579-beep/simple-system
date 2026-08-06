import type { TxClient } from "./post-journal"
import { COA_CODE } from "./coa-seed"

/** Kode COA yang dipetakan ke sebuah Account (kas/bank). Setiap Account kas/bank di-backfill
 *  dengan coaAccountId saat seeding (scripts/seed-coa.ts) — kalau ada Account baru yang belum
 *  dipetakan (dibuat lewat Keuangan setelah seeding), fallback ke parent "1-1000 Kas & Bank"
 *  supaya posting tetap jalan walau belum granular per akun. */
export async function getAccountCoaCode(tx: TxClient, accountId: string): Promise<string> {
  const account = await tx.account.findUnique({ where: { id: accountId }, include: { coaAccount: true } })
  if (account?.coaAccount) return account.coaAccount.code
  return COA_CODE.kasBankParent
}

/** Kode COA pendapatan/beban yang dipetakan ke sebuah Category. Category tanpa pemetaan
 *  (belum di-set lewat halaman COA, atau categoryId kosong di transaksi) jatuh ke akun
 *  "Lain-lain" yang sesuai jenisnya. */
export async function getCategoryCoaCode(
  tx: TxClient,
  categoryId: string | null,
  kind: "income" | "expense"
): Promise<string> {
  const fallback = kind === "income" ? COA_CODE.pendapatanLain : COA_CODE.bebanLain
  if (!categoryId) return fallback
  const category = await tx.category.findUnique({ where: { id: categoryId }, include: { coaAccount: true } })
  return category?.coaAccount?.code ?? fallback
}
