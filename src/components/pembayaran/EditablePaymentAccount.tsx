"use client"

import React from "react"
import { InlineEditAccount } from "./InlineEditAccount"

/** "Masuk ke Akun" di kwitansi pembayaran — klik buat pilih akun kas/bank lain langsung dari
 *  dropdown, tanpa perlu hapus draft + input ulang. Cuma dipakai saat masih draft (lihat
 *  guard postStatus === "draft" di caller), API PATCH-nya sendiri juga menolak kalau sudah
 *  posted/voided. */
export const EditablePaymentAccount: React.FC<{ paymentId: string; accountId: string; accountName: string }> = ({
  paymentId,
  accountId,
  accountName,
}) => {
  const handleSave = async (newAccountId: string) => {
    const res = await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: newAccountId }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || "Gagal menyimpan")
  }

  return <InlineEditAccount accountId={accountId} accountName={accountName} onSave={handleSave} />
}
