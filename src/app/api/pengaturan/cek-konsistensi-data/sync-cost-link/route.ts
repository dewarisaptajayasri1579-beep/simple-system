import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { syncCostLinkedInvoice } from "@/lib/cost-link-sync"

/** Tombol "Sinkronkan" per-temuan "Cost-link kemungkinan belum ke-sync" (lihat
 *  ConsistencyFindingsList.tsx) — Owner klik satu-satu untuk membetulkan lastPaidAt/expiryDate
 *  Domain/Server/Maintenance sesuai tanggal pembayaran invoice yang sudah lunas. Owner-only:
 *  ini mengubah tanggal billing yang memengaruhi siklus jatuh tempo & SLA berikutnya. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa sinkronkan cost-link" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : ""
  if (!invoiceId) return NextResponse.json({ error: "invoiceId wajib diisi" }, { status: 400 })

  try {
    const result = await syncCostLinkedInvoice(invoiceId)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sinkronkan"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
