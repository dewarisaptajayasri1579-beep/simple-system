"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, BookOpen, Printer, MoreVertical } from "lucide-react";
import { JournalPreviewModal, type JournalSource } from "@/components/akuntansi/JournalPreviewModal";

/** Menu Aksi per baris Riwayat Kas Keluar — kebab menu (bukan tombol Edit tunggal seperti
 *  sebelumnya), karena "Lihat/Edit Detail" sekarang satu pintu ke halaman detail transaksi
 *  (yang sudah punya form edit inline sendiri kalau masih draft), dan "Cetak Bukti Kas" langsung
 *  memicu print begitu halaman detail terbuka (lihat query ?print=1, AutoPrint). SENGAJA tidak
 *  ada "Batalkan" di sini — pembatalan cuma boleh dari halaman detail (Owner-only, lihat
 *  TransactionPostingBar), bukan langsung dari baris tabel supaya tidak kepencet tidak sengaja. */
export const KasKeluarRowActions: React.FC<{ transactionId: string; transactionNumber: string; journalSource: JournalSource }> = ({
  transactionId,
  transactionNumber,
  journalSource,
}) => {
  const [open, setOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const itemClass =
    "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 rounded-xl transition-colors text-left cursor-pointer";

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/80 hover:bg-white border border-slate-200/90 shadow-sm text-slate-500 transition-all cursor-pointer"
        aria-label="Aksi"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 glass-dropdown p-2 rounded-2xl shadow-xl z-50">
          <Link href={`/keuangan/transaksi/${transactionId}`} className={itemClass} onClick={() => setOpen(false)}>
            <Eye className="w-4 h-4 flex-shrink-0" />
            Lihat / Edit Detail
          </Link>
          <button
            className={itemClass}
            onClick={() => {
              setOpen(false);
              setJournalOpen(true);
            }}
          >
            <BookOpen className="w-4 h-4 flex-shrink-0" />
            Lihat Jurnal
          </button>
          <Link href={`/keuangan/transaksi/${transactionId}?print=1`} className={itemClass} onClick={() => setOpen(false)}>
            <Printer className="w-4 h-4 flex-shrink-0" />
            Cetak Bukti Kas
          </Link>
        </div>
      )}

      <JournalPreviewModal open={journalOpen} onClose={() => setJournalOpen(false)} title={`Jurnal — ${transactionNumber}`} sources={[journalSource]} />
    </div>
  );
};
