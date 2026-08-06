"use client";

import React, { useEffect, useRef, useState } from "react";
import { Columns3, Check } from "lucide-react";
import type { ColumnDef } from "@/lib/use-column-visibility";

export interface ColumnVisibilityMenuProps {
  columns: ColumnDef[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
}

export const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({ columns, isVisible, onToggle }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3.5 h-9 rounded-xl bg-white/80 hover:bg-white border border-slate-200/90 shadow-sm text-xs font-bold text-slate-600 transition-all cursor-pointer"
      >
        <Columns3 className="w-4 h-4" />
        Kolom
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 glass-dropdown p-2 rounded-2xl shadow-xl z-50">
          {columns.map((col) => (
            <button
              key={col.key}
              onClick={() => onToggle(col.key)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 rounded-xl transition-colors text-left cursor-pointer"
            >
              <span
                className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                  isVisible(col.key) ? "bg-blue-600 border-blue-600" : "border-slate-300"
                }`}
              >
                {isVisible(col.key) && <Check className="w-3 h-3 text-white" />}
              </span>
              <span>{col.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
