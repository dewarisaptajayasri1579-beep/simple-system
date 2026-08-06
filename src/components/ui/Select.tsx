"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, SearchX } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  sizeVariant?: "sm" | "md" | "lg";
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Kalau true, ketika pencarian tidak match opsi manapun, tampilkan baris "Tambah '<query>'"
   *  yang memanggil onCreateOption untuk membuat opsi baru secara inline. */
  creatable?: boolean;
  onCreateOption?: (query: string) => void | Promise<SelectOption | null | undefined>;
  createOptionLabel?: (query: string) => string;
  /** Kalau true, klik "Tambah" langsung menutup dropdown tanpa menunggu onCreateOption selesai
   *  dan tidak otomatis memilih hasilnya — dipakai saat onCreateOption cuma memicu alur lain
   *  (mis. membuka modal terpisah) yang nanti men-set value-nya sendiri. */
  deferCreate?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value = "",
  onChange,
  error,
  helperText,
  leftIcon,
  sizeVariant = "lg",
  placeholder = "Pilih salah satu",
  disabled,
  id,
  className = "",
  searchable = true,
  searchPlaceholder = "Cari...",
  emptyText = "Tidak ada hasil ditemukan",
  creatable = false,
  onCreateOption,
  createOptionLabel,
  deferCreate = false,
}) => {
  const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [creating, setCreating] = useState(false);

  // The dropdown panel is teleported into document.body (see openDropdown/render below) because
  // ancestor cards use backdrop-filter, which creates a CSS stacking context a local z-index can't
  // escape — without the portal the panel renders visually behind later page content and is unclickable.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filterOptions = (opts: SelectOption[], q: string) => {
    if (!searchable || !q.trim()) return opts;
    const needle = q.trim().toLowerCase();
    return opts.filter((opt) => opt.label.toLowerCase().includes(needle));
  };

  const filteredOptions = useMemo(
    () => filterOptions(options, query),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, query, searchable]
  );

  const selectedOption = options.find((opt) => opt.value === value);

  const trimmedQuery = query.trim();
  const showCreateRow =
    creatable &&
    !!onCreateOption &&
    trimmedQuery.length > 0 &&
    !options.some((opt) => opt.label.trim().toLowerCase() === trimmedQuery.toLowerCase());

  const handleCreate = async () => {
    if (!onCreateOption || !trimmedQuery) return;
    if (deferCreate) {
      setOpen(false);
      void onCreateOption(trimmedQuery);
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const newOption = await onCreateOption(trimmedQuery);
      if (newOption) {
        onChange?.(newOption.value);
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 8, left: rect.left, width: rect.width });
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideWrapper = wrapperRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideWrapper && !insidePanel) setOpen(false);
    };
    const handleReposition = () => updateCoords();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  const firstEnabledIndex = (opts: SelectOption[]) => {
    const idx = opts.findIndex((opt) => !opt.disabled);
    return idx === -1 ? 0 : idx;
  };

  const openDropdown = () => {
    if (disabled) return;
    setQuery("");
    setActiveIndex(firstEnabledIndex(options));
    updateCoords();
    setOpen(true);
    if (searchable) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  };

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setActiveIndex(firstEnabledIndex(filterOptions(options, q)));
  };

  const commitSelection = (opt: SelectOption) => {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setOpen(false);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      openDropdown();
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => {
        for (let i = prev + 1; i < filteredOptions.length; i++) {
          if (!filteredOptions[i].disabled) return i;
        }
        return prev;
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => {
        for (let i = prev - 1; i >= 0; i--) {
          if (!filteredOptions[i].disabled) return i;
        }
        return prev;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filteredOptions[activeIndex];
      if (opt) commitSelection(opt);
      else if (showCreateRow) handleCreate();
    }
  };

  const sizeClasses = {
    sm: "h-10 text-xs px-3 rounded-xl",
    md: "h-12 text-sm px-4 rounded-xl",
    lg: "h-14 text-base px-4 rounded-2xl",
  };

  const leftPadding = leftIcon ? (sizeVariant === "sm" ? "pl-9" : "pl-12") : "";

  return (
    <div className="w-full flex flex-col gap-1.5" ref={wrapperRef}>
      {label && (
        <label htmlFor={generatedId} className="text-xs sm:text-sm font-bold text-slate-700 select-none">
          {label}
        </label>
      )}
      <div className="relative w-full">
        <button
          type="button"
          id={generatedId}
          ref={triggerRef}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          onClick={() => {
            if (disabled) return;
            if (open) setOpen(false);
            else openDropdown();
          }}
          onKeyDown={handleTriggerKeyDown}
          className={`w-full flex items-center ${sizeClasses[sizeVariant]} ${leftPadding} pr-10 bg-white/60 hover:bg-white/80 border border-slate-200/80 text-left transition-all duration-200 focus:outline-none focus:bg-white/95 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-md shadow-[0_2px_6px_rgba(0,0,0,0.02)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            open ? "bg-white/95 border-blue-600 ring-4 ring-blue-500/10" : ""
          } ${error ? "border-red-500 focus:ring-red-500/10 focus:border-red-500" : ""} ${className}`}
        >
          {leftIcon && (
            <span className="absolute left-4 text-slate-600 flex items-center justify-center pointer-events-none">
              {leftIcon}
            </span>
          )}
          <span
            className={`flex-1 min-w-0 truncate font-medium ${
              selectedOption && !selectedOption.disabled ? "text-slate-800" : "text-slate-400"
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </button>
        <div
          className={`absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 flex items-center justify-center pointer-events-none transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <ChevronDown className="w-5 h-5 stroke-[2.2]" />
        </div>
      </div>
      {error ? (
        <span className="text-xs font-semibold text-red-500">{error}</span>
      ) : helperText ? (
        <span className="text-xs font-medium text-slate-500">{helperText}</span>
      ) : null}

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
            className="z-50 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-2xl shadow-slate-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {searchable && (
              <div className="p-2 border-b border-slate-100">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={handleListKeyDown}
                    placeholder={searchPlaceholder}
                    className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200/80 text-sm text-slate-800 placeholder:text-slate-400 font-medium focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                  />
                </div>
              </div>
            )}
            <ul
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              onKeyDown={handleListKeyDown}
              className="max-h-56 overflow-y-auto py-1.5 px-1.5 space-y-0.5"
            >
              {filteredOptions.length === 0 && !showCreateRow ? (
                <li className="flex flex-col items-center justify-center gap-1.5 py-6 text-slate-400">
                  <SearchX className="w-5 h-5" />
                  <span className="text-xs font-semibold">{emptyText}</span>
                </li>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isActive = idx === activeIndex;
                  return (
                    <li
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => commitSelection(opt)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed"
                          : isActive
                          ? "bg-blue-50 text-[#0544cc]"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                      <span className="flex-1 min-w-0 truncate">{opt.label}</span>
                      {isSelected && <Check className="w-4 h-4 flex-shrink-0 text-[#0544cc]" />}
                    </li>
                  );
                })
              )}
              {showCreateRow && (
                <li
                  role="option"
                  aria-selected={false}
                  onClick={handleCreate}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors text-[#0544cc] hover:bg-blue-50 border-t border-slate-100 mt-0.5 pt-3"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    {creating ? "Menambahkan..." : createOptionLabel ? createOptionLabel(trimmedQuery) : `Tambah "${trimmedQuery}"`}
                  </span>
                </li>
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
};

Select.displayName = "Select";
