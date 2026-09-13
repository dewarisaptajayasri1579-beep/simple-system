"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnBackdropClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  closeOnBackdropClick = true,
}) => {
  // Dirender lewat portal ke <body>, BUKAN di tempat asalnya di pohon komponen. Alasannya:
  // `position: fixed` berhenti mengacu ke layar begitu ada leluhur yang punya `backdrop-filter`
  // atau `transform` — keduanya bikin containing block baru (spek CSS). Semua Card glass di app
  // ini punya `backdrop-filter: blur(...)` (lihat globals.css .glass-*), jadi modal yang kebetulan
  // dirender di dalam sebuah Card jadi terkurung di dalam kotak Card itu: backdrop-nya cuma
  // menutup area Card, posisinya meleset, dan bagian yang keluar kotak ke-clip sehingga tidak bisa
  // diklik sama sekali. Portal memutus rantai leluhur itu, jadi Modal selalu benar di mana pun
  // dipasang. Pola yang sama sudah dipakai dropdown Select.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw] h-[90vh]",
  };

  return createPortal(
    // `no-print`: sebelum pakai portal, modal ikut tersembunyi saat print karena leluhurnya
    // memang tidak ikut dicetak. Setelah dipindah ke <body>, kaitan itu putus — tanpa ini,
    // cetak halaman (nota/invoice) yang kebetulan lagi buka modal jadi ikut mencetak overlaynya.
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={closeOnBackdropClick ? onClose : undefined}
      />

      {/* Modal Card */}
      <div
        className={`relative w-full ${sizeClasses[size]} glass-modal p-6 sm:p-8 rounded-[32px] shadow-2xl z-10 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]`}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between pb-4 border-b border-slate-200/60 mb-5 gap-4">
            <div>
              {title && typeof title === "string" ? (
                <h3 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h3>
              ) : (
                title
              )}
              {subtitle && typeof subtitle === "string" ? (
                <p className="text-sm text-slate-600 font-medium mt-1">{subtitle}</p>
              ) : (
                subtitle
              )}
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pr-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="pt-5 mt-5 border-t border-slate-200/60 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
