"use client";

import { Button } from "@/components/ui";
import { normalizePhoneForWaMe } from "@/lib/phone";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

/** Lucide tidak punya ikon brand (WhatsApp dkk) — SVG resmi logo WhatsApp, inline. */
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.5 1.34 5.02L2 22l5.12-1.34A9.96 9.96 0 0 0 12.04 22c5.52 0 10-4.48 10-10s-4.48-10-10-10Zm0 18.13c-1.6 0-3.15-.43-4.5-1.24l-.32-.19-3.04.8.81-2.96-.21-.31a8.1 8.1 0 0 1-1.25-4.33c0-4.51 3.67-8.18 8.18-8.18 4.51 0 8.18 3.67 8.18 8.18 0 4.51-3.67 8.23-8.18 8.23Zm4.48-6.13c-.25-.12-1.45-.71-1.67-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.78.96-.14.16-.29.18-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42-.14 0-.31-.02-.47-.02-.16 0-.43.06-.66.31-.22.25-.86.85-.86 2.06 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.24 3.74.59.26 1.06.41 1.42.52.6.19 1.14.16 1.57.1.48-.07 1.45-.59 1.65-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.47-.28Z" />
  </svg>
);

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
    <Button
      variant="success"
      className="!bg-[#25D366] !border-[#25D366] hover:!bg-[#20BD5A] !shadow-[#25D366]/25 hover:!shadow-[#25D366]/40"
      leftIcon={<WhatsAppIcon className="w-4 h-4" />}
      onClick={handleClick}
    >
      Kirim WhatsApp
    </Button>
  );
};
