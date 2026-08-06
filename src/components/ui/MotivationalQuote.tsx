"use client";

import React, { useEffect, useState } from "react";
import { getRandomMotivationalQuote } from "@/lib/motivational-quotes";

export const MotivationalQuote: React.FC<{ className?: string }> = ({ className = "" }) => {
  // Dipilih setelah mount (bukan saat SSR) supaya tidak mismatch hydration —
  // kalimatnya boleh beda tiap reload/refresh, itu memang tujuannya ("ganti-ganti").
  const [quote, setQuote] = useState<string | null>(null);

  useEffect(() => {
    setQuote(getRandomMotivationalQuote());
  }, []);

  if (!quote) return null;

  return <p className={`italic text-slate-500 ${className}`}>&ldquo;{quote}&rdquo;</p>;
};
