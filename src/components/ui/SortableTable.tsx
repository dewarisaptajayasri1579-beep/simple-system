"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Filter, Check } from "lucide-react";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import type { ColumnDef } from "@/lib/use-column-visibility";
import { getPageWindow } from "@/lib/pagination";

export interface SortableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Diberikan → header kolom ini bisa diklik untuk sort. Tanpa ini, header polos. */
  sortValue?: (row: T) => string | number;
  /** Diberikan → nilainya ikut dicocokkan kotak pencarian. */
  filterValue?: (row: T) => string;
  headClassName?: string;
  cellClassName?: string;
  cell: (row: T, index: number) => React.ReactNode;
}

export interface SortableTableFilterGroup<T> {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Baris lolos filter ini kalau predicate true, ATAU kalau value kosong (berarti "semua"). */
  predicate: (row: T, value: string) => boolean;
}

export interface SortableTableColumnMenu {
  columns: ColumnDef[];
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
}

export interface SortableTableProps<T> {
  rows: T[];
  columns: SortableColumn<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  pageSize?: number;
  filterGroups?: SortableTableFilterGroup<T>[];
  columnMenu?: SortableTableColumnMenu;
  resultLabel?: string;
}

/** Tabel dengan header biru, kolom bisa di-sort lewat tombol, toolbar search+filter+kolom jadi
 *  satu baris, footer pagination "Tampilkan N dari X data" + tombol nomor halaman. */
export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  searchPlaceholder = "Cari...",
  emptyMessage = "Tidak ada data yang cocok.",
  pageSize: pageSizeAwal = 10,
  filterGroups,
  columnMenu,
  resultLabel,
}: SortableTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeAwal);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterGroups || filterGroups.length === 0) return;
    const handleClick = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setIsFilterMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterGroups]);

  const searchableColumns = useMemo(() => columns.filter((c) => c.filterValue), [columns]);
  const hasToolbar = searchableColumns.length > 0 || !!filterGroups?.length || !!columnMenu;
  const activeFilterCount = filterGroups?.filter((g) => g.value).length ?? 0;

  const filteredByGroups = useMemo(() => {
    let result = rows.filter((row): row is T => row != null);
    if (filterGroups && filterGroups.length > 0) {
      result = result.filter((row) => filterGroups.every((g) => !g.value || g.predicate(row, g.value)));
    }
    return result;
  }, [rows, filterGroups]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || searchableColumns.length === 0) return filteredByGroups;
    return filteredByGroups.filter((row) => searchableColumns.some((col) => col.filterValue!(row).toLowerCase().includes(term)));
  }, [filteredByGroups, search, searchableColumns]);

  const sorted = useMemo(() => {
    if (!sortColumn) return filtered;
    const activeColumn = columns.find((c) => c.key === sortColumn);
    if (!activeColumn?.sortValue) return filtered;
    const list = [...filtered];
    list.sort((a, b) => {
      let valA: string | number = activeColumn.sortValue!(a);
      let valB: string | number = activeColumn.sortValue!(b);
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortColumn, sortDirection, columns]);

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const pageRows = sorted.slice(startIndex, startIndex + pageSize);
  const pageNumbers = useMemo(() => getPageWindow(activePage, totalPages), [activePage, totalPages]);

  const handleSort = (key: string) => {
    if (sortColumn === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortColumn(key);
      setSortDirection("asc");
    }
  };

  const alignClass = (align?: "left" | "right" | "center") => (align === "right" ? "text-right" : align === "center" ? "text-center" : "");

  return (
    <div>
      {hasToolbar && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3.5">
          {searchableColumns.length > 0 ? (
            <div className="relative flex items-center w-full sm:max-w-[180px] lg:max-w-[270px] sm:shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 pl-9 pr-3.5 text-xs sm:text-sm font-medium rounded-xl bg-white/90 border border-slate-200/90 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-colors shadow-sm"
              />
            </div>
          ) : (
            <div />
          )}

          <div className="flex flex-1 flex-wrap items-center gap-2 md:justify-end">
            <p className="text-xs font-semibold text-slate-600 md:text-right">
              {resultLabel ?? `${totalItems} data`}
              {resultLabel && <span className="font-normal text-slate-400"> · {totalItems} data</span>}
            </p>

            {filterGroups && filterGroups.length > 0 && (
              <div className="relative" ref={filterMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsFilterMenuOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white/90 hover:bg-slate-50 border border-slate-200/90 shadow-sm text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
                >
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {isFilterMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50 max-h-80 overflow-y-auto">
                    {filterGroups.map((g, gi) => (
                      <div key={g.key}>
                        {gi > 0 && <div className="my-1.5 border-t border-slate-200/70" />}
                        <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{g.label}</p>
                        {[{ value: "", label: `Semua ${g.label}` }, ...g.options].map((opt) => (
                          <button
                            key={opt.value || "all"}
                            type="button"
                            onClick={() => {
                              g.onChange(opt.value);
                              setCurrentPage(1);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold rounded-lg text-left cursor-pointer transition-colors ${
                              g.value === opt.value ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100/70"
                            }`}
                          >
                            <span>{opt.label}</span>
                            {g.value === opt.value && <Check className="w-3.5 h-3.5 text-blue-700" />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {columnMenu && <ColumnVisibilityMenu columns={columnMenu.columns} isVisible={columnMenu.isVisible} onToggle={columnMenu.toggle} />}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200/70">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-blue-50/70 text-[11px] font-bold text-slate-700 border-b border-slate-200/80">
              {columns.map((col) => (
                <th key={col.key} className={`py-3.5 px-3 ${alignClass(col.align)} ${col.headClassName ?? ""}`}>
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className={`flex items-center gap-1.5 hover:text-blue-700 transition-colors cursor-pointer ${col.align === "right" ? "justify-end w-full" : ""}`}
                    >
                      <span>{col.header}</span>
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-70" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {pageRows.length > 0 ? (
              pageRows.map((row, i) => (
                <tr key={rowKey(row)} className="hover:bg-blue-50/20 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={`py-3 px-3 ${alignClass(col.align)} ${col.cellClassName ?? ""}`}>
                      {col.cell(row, startIndex + i)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="text-center py-10 text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-2">
          <span>Tampilkan</span>
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-8 pl-2.5 pr-7 rounded-lg bg-white border border-slate-200/90 text-slate-700 cursor-pointer focus:outline-none appearance-none font-bold"
            >
              {[5, 10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>
          <span>dari {totalItems} data</span>
        </div>

        <div className="flex items-center gap-1 self-end sm:self-auto">
          <button
            type="button"
            disabled={activePage <= 1}
            onClick={() => setCurrentPage(Math.max(1, activePage - 1))}
            className="w-8 h-8 rounded-lg border border-slate-200/90 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {pageNumbers.map((pg) => (
            <button
              key={pg}
              type="button"
              onClick={() => setCurrentPage(pg)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activePage === pg ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200/90 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {pg}
            </button>
          ))}

          <button
            type="button"
            disabled={activePage >= totalPages}
            onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))}
            className="w-8 h-8 rounded-lg border border-slate-200/90 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
