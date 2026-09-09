"use client";

import { useEffect } from "react";

/** Trigger window.print() otomatis begitu halaman ini kebuka — dipakai lewat query ?print=1
 *  (lihat KasKeluarRowActions "Cetak Bukti Kas") supaya klik 1x di dropdown Aksi langsung buka
 *  dialog print, tidak perlu klik tombol "Cetak" lagi di halaman detailnya. */
export const AutoPrint: React.FC = () => {
  useEffect(() => {
    window.print();
  }, []);
  return null;
};
