"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button, Modal, Input } from "@/components/ui";
import { waWebUrl, WA_WEB_WINDOW_NAME } from "@/lib/phone";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

/** Lucide tidak punya ikon brand (WhatsApp dkk) — SVG resmi logo WhatsApp, inline. Sama persis
 *  dengan InvoiceWhatsAppButton.tsx. */
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.5 1.34 5.02L2 22l5.12-1.34A9.96 9.96 0 0 0 12.04 22c5.52 0 10-4.48 10-10s-4.48-10-10-10Zm0 18.13c-1.6 0-3.15-.43-4.5-1.24l-.32-.19-3.04.8.81-2.96-.21-.31a8.1 8.1 0 0 1-1.25-4.33c0-4.51 3.67-8.18 8.18-8.18 4.51 0 8.18 3.67 8.18 8.18 0 4.51-3.67 8.23-8.18 8.23Zm4.48-6.13c-.25-.12-1.45-.71-1.67-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.78.96-.14.16-.29.18-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42-.14 0-.31-.02-.47-.02-.16 0-.43.06-.66.31-.22.25-.86.85-.86 2.06 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.24 3.74.59.26 1.06.41 1.42.52.6.19 1.14.16 1.57.1.48-.07 1.45-.59 1.65-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.47-.28Z" />
  </svg>
);

export interface PaymentWhatsAppButtonProps {
  paymentId: string;
  paymentNumber: string;
  totalAmount: number;
  clientName: string;
  clientPhone: string;
}

/** Tombol "Kirim WhatsApp" — sama pola dengan InvoiceWhatsAppButton.tsx: dropdown 2 opsi ("Kirim WA"
 *  buka web.whatsapp.com dengan pesan siap kirim + link ke PDF Kwitansi, "Unduh Manual" buat staf
 *  yang mau attach PDF asli — bukan cuma link — di WA Desktop/app HP-nya sendiri). Link PDF-nya
 *  lihat /api/payments/[id]/pdf, sengaja tanpa login supaya Client bisa buka linknya. Cuma
 *  dipasang di halaman detail Pembayaran setelah `postStatus` posted (lihat pembayaran/[id]/page.tsx). */
export const PaymentWhatsAppButton: React.FC<PaymentWhatsAppButtonProps> = ({
  paymentId,
  paymentNumber,
  totalAmount,
  clientName,
  clientPhone,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [phone, setPhone] = useState(clientPhone);
  const [name, setName] = useState(clientName);
  const [message, setMessage] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const buildMessage = () => {
    const pdfUrl = `${window.location.origin}/api/payments/${paymentId}/pdf`;
    return [
      `Halo ${clientName},`,
      `Berikut kwitansi pembayaran ${paymentNumber} sebesar ${formatRupiah(totalAmount)}.`,
      ``,
      `Kwitansi (PDF): ${pdfUrl}`,
      ``,
      `Terima kasih.`,
    ].join("\n");
  };

  const handleKirimWA = () => {
    setMenuOpen(false);
    window.open(waWebUrl(clientPhone, buildMessage()), WA_WEB_WINDOW_NAME, "noopener,noreferrer");
  };

  const openUnduhManual = () => {
    setMenuOpen(false);
    setPhone(clientPhone);
    setName(clientName);
    setMessage(buildMessage());
    setModalOpen(true);
  };

  const handleUnduh = () => {
    const a = document.createElement("a");
    a.href = `/api/payments/${paymentId}/pdf`;
    a.download = `${paymentNumber.replace(/\//g, "-")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <div className="relative inline-block" ref={menuRef}>
        <Button
          variant="success"
          className="!bg-[#25D366] !border-[#25D366] hover:!bg-[#20BD5A] !shadow-[#25D366]/25 hover:!shadow-[#25D366]/40"
          leftIcon={<WhatsAppIcon className="w-4 h-4" />}
          rightIcon={<ChevronDown className="w-4 h-4" />}
          onClick={() => setMenuOpen((o) => !o)}
        >
          Kirim WhatsApp
        </Button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 glass-dropdown p-1.5 rounded-2xl shadow-xl z-50">
            <button
              onClick={handleKirimWA}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 rounded-xl transition-colors cursor-pointer"
            >
              Kirim WA
            </button>
            <button
              onClick={openUnduhManual}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 rounded-xl transition-colors cursor-pointer"
            >
              Unduh Manual
            </button>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Unduh Manual" subtitle={`Kwitansi ${paymentNumber}`}>
        <div className="space-y-4">
          <Input label="No HP Penerima" sizeVariant="sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Nama Penerima" sizeVariant="sm" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs sm:text-sm font-bold text-slate-700">Pesan</label>
            <textarea
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm bg-white/60 hover:bg-white/80 border border-slate-200/80 text-slate-800 placeholder:text-slate-400 font-medium transition-all duration-200 focus:outline-none focus:bg-white/95 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" leftIcon={<Download className="w-4 h-4" />} onClick={handleUnduh}>
              Unduh Kwitansi
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
