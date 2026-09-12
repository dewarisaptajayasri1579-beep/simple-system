import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { buildPostingPreview, type PostingPreviewKind } from "@/lib/accounting/posting-preview"

const KINDS: PostingPreviewKind[] = [
  "transaction",
  "transaction-void",
  "payment",
  "payment-void",
  "account-transfer",
  "account-transfer-void",
  "journal-entry",
  "journal-entry-void",
  "invoice",
  "revenue-slot",
]

/** Resume inputan + proyeksi saldo untuk dialog konfirmasi posting/batalkan — read-only, tidak
 *  mengubah apa pun. Dipanggil oleh PostingConfirmDialog tepat sebelum staf menekan "Ya, Posting"
 *  (bukan saat halaman dibuka) supaya angka saldo yang ditampilkan selalu yang terbaru. */
export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const url = new URL(request.url)
  const kind = url.searchParams.get("kind") as PostingPreviewKind | null
  const id = url.searchParams.get("id")
  if (!kind || !KINDS.includes(kind)) return NextResponse.json({ error: "Jenis transaksi tidak dikenal" }, { status: 400 })
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 })

  // Cuma dipakai Slotting Omset: checkbox biaya admin per rekening tujuan masih state di UI
  // (bisa dioverride staf sebelum diproses), jadi ikut dikirim supaya nominal di resume sama
  // persis dengan yang nanti dieksekusi endpoint process.
  const rawFeeOverrides = url.searchParams.get("feeOverrides")
  let feeOverrides: Record<string, boolean> | undefined
  if (rawFeeOverrides) {
    try {
      const parsed = JSON.parse(rawFeeOverrides)
      if (parsed && typeof parsed === "object") feeOverrides = parsed as Record<string, boolean>
    } catch {
      // format tidak valid -> abaikan, jatuh ke deteksi otomatis by bank name di preview
    }
  }

  try {
    return NextResponse.json(await buildPostingPreview(kind, id, { feeOverrides }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyiapkan konfirmasi" }, { status: 400 })
  }
}
