"use client";

import { Button } from "@/components/ui";
import { MessageCircle } from "lucide-react";
import { normalizePhoneForWaMe } from "@/lib/phone";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export interface InvoiceWhatsAppButtonProps {
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: number;
  clientName: string;
  clientPhone: string;
}

/** Tombol "Kirim WhatsApp" — buka wa.me (bukan kirim otomatis lewat WAHUB) dengan pesan siap
 *  kirim + link ke PDF invoice ini (lihat /api/invoices/[id]/pdf, sengaja tanpa login supaya
 *  Client bisa buka linknya). Staf yang review pesannya sebelum tekan kirim di WhatsApp-nya
 *  sendiri, sama pola dengan tombol follow-up "Manual" di Dashboard. */
export const InvoiceWhatsAppButton: React.FC<InvoiceWhatsAppButtonProps> = ({
  invoiceId,
  invoiceNumber,
  totalAmount,
  clientName,
  clientPhone,
}) => {
  const handleClick = () => {
    const pdfUrl = `${window.location.origin}/api/invoices/${invoiceId}/pdf`;
    const message = [
      `Halo ${clientName},`,
      `Berikut invoice ${invoiceNumber} sebesar ${formatRupiah(totalAmount)}.`,
      ``,
      `Invoice (PDF): ${pdfUrl}`,
      ``,
      `Terima kasih.`,
    ].join("\n");
    const waUrl = `https://wa.me/${normalizePhoneForWaMe(clientPhone)}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Button variant="outline" leftIcon={<MessageCircle className="w-4 h-4" />} onClick={handleClick}>
      Kirim WhatsApp
    </Button>
  );
};
