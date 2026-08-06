"use client";

import { useEffect, useState } from "react";

export interface ColumnDef {
  key: string;
  label: string;
}

/** Preferensi kolom mana yang ditampilkan per tabel, disimpan di localStorage per storageKey
 *  supaya pilihan user diingat lintas kunjungan (bukan cuma di sesi ini). */
export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const allKeys = columns.map((c) => c.key);
  const [visible, setVisible] = useState<Set<string>>(new Set(allKeys));

  useEffect(() => {
    const raw = window.localStorage.getItem(`columns:${storageKey}`);
    if (!raw) return;
    try {
      const saved: string[] = JSON.parse(raw);
      setVisible(new Set(saved.filter((k) => allKeys.includes(k))));
    } catch {
      // abaikan localStorage yang korup, pakai default semua kolom tampil
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggle = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.localStorage.setItem(`columns:${storageKey}`, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const isVisible = (key: string) => visible.has(key);

  return { isVisible, toggle };
}
