"use client";

import { PostingConfirmButton } from "@/components/akuntansi/PostingConfirmButton";

export interface InvoicePostButtonProps {
  invoiceId: string;
}

/** Tombol "Posting" invoice draft — sama pola dgn Payment/Transaction lain (draft belum masuk
 *  laporan/bisa dibayar). Dipasang di halaman Detail Invoice supaya jelas kelihatan kenapa
 *  "Input Pembayaran" belum bisa dipakai (form Pembayaran cuma nampilin invoice postStatus
 *  "posted" — lihat PembayaranForm.tsx). */
export const InvoicePostButton: React.FC<InvoicePostButtonProps> = ({ invoiceId }) => (
  <div className="flex flex-col items-end gap-2">
    <PostingConfirmButton
      previewKind="invoice"
      previewId={invoiceId}
      postUrl={`/api/invoices/${invoiceId}/post`}
      label="Posting Invoice"
      size="md"
    />
  </div>
);
