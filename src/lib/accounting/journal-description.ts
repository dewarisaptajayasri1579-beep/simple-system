import { prisma } from "@/lib/prisma"

interface EntryRef {
  id: string
  sourceType: string
  sourceId: string | null
  description: string
}

/**
 * Keterangan mutasi Buku Besar (dan tempat lain yang butuh "kenapa mutasi ini ada") diperkaya
 * DI SINI saat ditampilkan — bukan dengan menulis ulang JournalEntry.description asli — supaya
 * histori apa yang staf ketik saat input tetap utuh, tapi yang tampil ke user tetap informatif
 * (client/akun terkait) walau description aslinya singkat (mis. Pindah Buku cuma diisi "Pinbuk",
 * tidak nyebut dari/ke akun apa; Pelunasan invoice cuma nyebut nomor invoice, tidak nyebut client
 * siapa — padahal datanya sudah ada lewat relasi AccountTransfer/Invoice, cuma belum digabung).
 *
 * Batched per sourceType (bukan query 1 per baris) — dipanggil sekali per halaman/response, bukan
 * di dalam loop render.
 */
export async function enrichJournalDescriptions(entries: EntryRef[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  for (const e of entries) result.set(e.id, e.description)

  const idsOf = (type: string) => entries.filter((e) => e.sourceType === type && e.sourceId).map((e) => e.sourceId as string)

  // Pindah Buku — tambahkan dari akun apa ke akun apa, supaya deskripsi bebas staf (mis. "Pinbuk")
  // tetap kebaca jelas konteksnya tanpa perlu buka detail jurnal.
  const transferIds = idsOf("transfer")
  if (transferIds.length) {
    const transfers = await prisma.accountTransfer.findMany({
      where: { id: { in: transferIds } },
      select: { id: true, sourceAccount: { select: { name: true } }, destinationAccount: { select: { name: true } } },
    })
    const byId = new Map(transfers.map((t) => [t.id, t]))
    for (const e of entries) {
      if (e.sourceType !== "transfer" || !e.sourceId) continue
      const t = byId.get(e.sourceId)
      if (t) result.set(e.id, `${e.description} (${t.sourceAccount.name} → ${t.destinationAccount.name})`)
    }
  }

  // Pelunasan invoice — tambahkan nama client (description asli cuma nyebut nomor invoice, mis.
  // "Pelunasan PMT/2026/00032 - invoice INV/2026/00240", tidak nyebut ini invoice siapa).
  // sourceId untuk "invoice_payment" = Transaction.id (lihat payments/route.ts), bukan Payment.id
  // atau InvoicePayment.id langsung.
  const paymentTxIds = idsOf("invoice_payment")
  if (paymentTxIds.length) {
    const txs = await prisma.transaction.findMany({
      where: { id: { in: paymentTxIds } },
      select: {
        id: true,
        invoicePayment: { select: { invoice: { select: { client: { select: { name: true } } } } } },
      },
    })
    const byId = new Map(txs.map((t) => [t.id, t]))
    for (const e of entries) {
      if (e.sourceType !== "invoice_payment" || !e.sourceId) continue
      // Tidak semua "invoice_payment" punya InvoicePayment terkait — setor PPN Keluaran juga
      // pakai sourceType ini tapi Transaction-nya berdiri sendiri (lihat payments/route.ts),
      // biarkan pakai description asli kalau begitu.
      const clientName = byId.get(e.sourceId)?.invoicePayment?.invoice.client.name
      if (clientName) result.set(e.id, `${e.description} — ${clientName}`)
    }
  }

  return result
}
