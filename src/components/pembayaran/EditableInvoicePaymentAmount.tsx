"use client"

import React from "react"
import { InlineEditAmount } from "./InlineEditAmount"

/** Kolom "Dibayar" tiap baris invoice di kwitansi pembayaran draft — klik nominalnya buat
 *  ubah langsung, tanpa hapus+input ulang seluruh kwitansi. */
export const EditableInvoicePaymentAmount: React.FC<{ paymentId: string; invoicePaymentId: string; amount: number }> = ({
  paymentId,
  invoicePaymentId,
  amount,
}) => {
  const handleSave = async (newAmount: number) => {
    const res = await fetch(`/api/payments/${paymentId}/invoice-payments/${invoicePaymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: newAmount }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || "Gagal menyimpan")
  }

  return <InlineEditAmount value={amount} onSave={handleSave} />
}
