"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight } from "lucide-react";

interface SearchResult {
  type: "client" | "invoice" | "domain" | "server";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface SectionItem {
  label: string;
  href: string;
}

const SECTIONS: SectionItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Piutang", href: "/laporan/piutang" },
  { label: "Pembayaran", href: "/pembayaran" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Buat Penjualan Baru", href: "/penjualan/baru" },
  { label: "Keuangan", href: "/keuangan" },
  { label: "Laporan", href: "/laporan" },
  { label: "Laporan Keuangan", href: "/laporan/keuangan" },
  { label: "Laporan Laba Rugi", href: "/laporan/laba-rugi" },
  { label: "Laporan Laba Rugi (Akrual)", href: "/laporan/laba-rugi-akrual" },
  { label: "Laporan Neraca", href: "/laporan/neraca" },
  { label: "Laporan Neraca (Akrual)", href: "/laporan/neraca-akrual" },
  { label: "Laporan Penjualan", href: "/laporan/penjualan" },
  { label: "Akuntansi", href: "/akuntansi" },
  { label: "Dokumentasi", href: "/dokumentasi" },
  { label: "Pengaturan", href: "/pengaturan" },
];

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  client: "Client",
  invoice: "Invoice",
  domain: "Domain",
  server: "Server",
};

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    const handleToggleEvent = () => setIsOpen((prev) => !prev);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("toggle-command-palette", handleToggleEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("toggle-command-palette", handleToggleEvent);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const id = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(id);
    }
    document.body.style.overflow = "unset";
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }, [isOpen]);

  const matchedSections = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SECTIONS;
    return SECTIONS.filter((s) => s.label.toLowerCase().includes(term));
  }, [query]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => setResults(data.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const flatItems = useMemo(
    () => [...matchedSections.map((s) => ({ href: s.href })), ...results.map((r) => ({ href: r.href }))],
    [matchedSections, results]
  );

  useEffect(() => setActiveIndex(0), [query, results]);

  const go = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) go(item.href);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24 sm:pt-32 px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsOpen(false)} />
      <div className="relative w-full max-w-xl glass-modal rounded-[28px] shadow-2xl z-10 overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 flex-shrink-0">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Cari menu, client, invoice, domain, server..."
            className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-800 placeholder:text-slate-400"
          />
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Tutup pencarian">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {matchedSections.length > 0 && (
            <div className="px-2">
              <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Menu</p>
              {matchedSections.map((s, i) => {
                const active = i === activeIndex;
                return (
                  <button
                    key={s.href}
                    onClick={() => go(s.href)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors cursor-pointer ${
                      active ? "bg-[#0544cc] text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{s.label}</span>
                    <ArrowRight className={`w-3.5 h-3.5 ${active ? "text-white" : "text-slate-300"}`} />
                  </button>
                );
              })}
            </div>
          )}

          {query.trim().length >= 2 && (
            <div className="px-2 mt-2">
              <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{loading ? "Mencari..." : "Database"}</p>
              {results.length === 0 && !loading && <p className="px-3 py-2 text-sm text-slate-400">Tidak ada hasil.</p>}
              {results.map((r, i) => {
                const idx = matchedSections.length + i;
                const active = idx === activeIndex;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => go(r.href)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors cursor-pointer ${
                      active ? "bg-[#0544cc] text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{r.title}</p>
                      {r.subtitle && <p className={`text-xs truncate ${active ? "text-blue-100" : "text-slate-400"}`}>{r.subtitle}</p>}
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                      {TYPE_LABEL[r.type]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {matchedSections.length === 0 && query.trim().length < 2 && (
            <p className="px-5 py-6 text-sm text-slate-400 text-center">Ketik untuk mencari...</p>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-slate-200/60 flex items-center gap-4 text-[11px] text-slate-400 font-medium flex-shrink-0">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">↑↓</kbd> navigasi
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">Enter</kbd> buka
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">Esc</kbd> tutup
          </span>
        </div>
      </div>
    </div>
  );
};
