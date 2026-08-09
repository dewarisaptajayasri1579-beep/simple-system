"use client"

import React from "react"
import { InlineEditAccount } from "./InlineEditAccount"
import { InlineEditAmount } from "./InlineEditAmount"

/** Kolom "Akun" & "Jumlah" tiap baris Biaya (domain/server yang dikaitkan) di kwitansi
 *  pembayaran draft — klik buat ubah, sinkron ke jurnal draft-nya. Owner-only (sama seperti
 *  syarat mengaitkan biaya saat Pelunasan dibuat), API PATCH-nya juga menolak role lain. */
export const EditableCostAccount: React.FC<{ paymentId: string; transactionId: string; accountId: string; accountName: string }> = ({
  paymentId,
  transactionId,
  accountId,
  accountName,
}) => {
  const handleSave = async (newAccountId: string) => {
    const res = await fetch(`/api/payments/${paymentId}/costs/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: newAccountId }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || "Gagal menyimpan")
  }

  return <InlineEditAccount accountId={accountId} accountName={accountName} onSave={handleSave} />
}

export const EditableCostAmount: React.FC<{ paymentId: string; transactionId: string; amount: number }> = ({
  paymentId,
  transactionId,
  amount,
}) => {
  const handleSave = async (newAmount: number) => {
    const res = await fetch(`/api/payments/${paymentId}/costs/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: newAmount }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || "Gagal menyimpan")
  }

  return <InlineEditAmount value={amount} onSave={handleSave} />
}
