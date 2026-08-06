"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
}

export const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onPageChange, totalItems, pageSize }) => {
  if (totalItems === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-t border-slate-200/60 text-xs">
      <span className="font-semibold text-slate-500">
        {start}-{end} dari {totalItems}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white border border-slate-200/90 flex items-center justify-center text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-slate-700 px-2">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white border border-slate-200/90 flex items-center justify-center text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
