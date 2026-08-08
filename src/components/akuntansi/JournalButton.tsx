"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { JournalPreviewModal, type JournalSource } from "./JournalPreviewModal";

export interface JournalButtonProps {
  title: string;
  sources: JournalSource[];
  postUrl?: string;
  postLabel?: string;
  size?: "sm" | "md";
}

/** Tombol "Lihat Jurnal" siap-pakai — dipasang di baris/detail transaksi mana pun yang punya
 *  jurnal (Invoice, Pembayaran, Transaksi Keuangan, Bayar Server/Domain, Tandai Lunas). */
export const JournalButton: React.FC<JournalButtonProps> = ({ title, sources, postUrl, postLabel, size = "sm" }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="ghost" onClick={() => setOpen(true)}>
        Lihat Jurnal
      </Button>
      <JournalPreviewModal open={open} onClose={() => setOpen(false)} title={title} sources={sources} postUrl={postUrl} postLabel={postLabel} />
    </>
  );
};
