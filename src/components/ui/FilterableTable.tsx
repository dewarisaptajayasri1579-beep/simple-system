"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Table,
  TableContainer,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFilterRow,
  TableFilterCell,
  TableFilterInput,
  TableFilterSelect,
} from "./Table";
import { Pagination } from "./Pagination";
import { usePagination } from "@/lib/use-pagination";

export interface FilterableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T, rowIndex: number) => React.ReactNode;
  /** Return the text used to match this column's filter input. Omit to leave the column unfiltered. */
  filterValue?: (row: T) => string;
  /** Render the filter as a dropdown instead of a text input. */
  filterOptions?: { value: string; label: string }[];
  headClassName?: string;
  cellClassName?: string;
}

export interface FilterableTableProps<T> {
  columns: FilterableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  emptyMessage?: string;
  containerClassName?: string;
  /** Placeholder for the global search box. Set to null to hide the search box entirely. */
  searchPlaceholder?: string | null;
  /** Render rows as stacked cards on small screens instead of a table. */
  mobileCardMode?: boolean;
}

export function FilterableTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  emptyMessage = "Tidak ada data yang cocok.",
  containerClassName = "rounded-none border-x-0 border-b-0 shadow-none",
  searchPlaceholder = "Cari...",
  mobileCardMode = false,
}: FilterableTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const searchableColumns = useMemo(() => columns.filter((c) => c.filterValue), [columns]);

  const filteredRows = useMemo(() => {
    let result = rows;

    const activeFilters = columns.filter((c) => c.filterValue && filters[c.key]?.trim());
    if (activeFilters.length > 0) {
      result = result.filter((row) =>
        activeFilters.every((col) => col.filterValue!(row).toLowerCase().includes(filters[col.key]!.trim().toLowerCase()))
      );
    }

    const term = search.trim().toLowerCase();
    if (term && searchableColumns.length > 0) {
      result = result.filter((row) => searchableColumns.some((col) => col.filterValue!(row).toLowerCase().includes(term)));
    }

    return result;
  }, [rows, filters, search, columns, searchableColumns]);

  const pagination = usePagination(filteredRows.length, pageSize);
  const pageRows = filteredRows.slice(pagination.start, pagination.end);
  const hasFilters = columns.some((c) => c.filterValue);

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.setPage(1);
  };

  return (
    <>
      <TableContainer className={containerClassName}>
        {searchPlaceholder && searchableColumns.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-200/80 bg-white/60">
            <div className="relative flex items-center w-full max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                aria-label="Cari"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  pagination.setPage(1);
                }}
                className="w-full h-9 pl-9 pr-3 text-sm font-medium rounded-lg bg-white/70 border border-slate-200/80 text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors"
              />
            </div>
          </div>
        )}

        {mobileCardMode && (
          <div className="block md:hidden p-3 sm:p-4 space-y-3">
            {pageRows.map((row, i) => (
              <div key={rowKey(row)} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                <div className="space-y-3">
                  {columns.map((col) => (
                    <div key={col.key} className="flex items-start justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {col.header}
                      </div>
                      <div className={`min-w-0 text-sm font-medium text-slate-800 ${col.cellClassName ?? ""}`}>
                        {col.cell(row, pagination.start + i)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {pageRows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
                {emptyMessage}
              </div>
            )}
          </div>
        )}

        <div className={mobileCardMode ? "hidden md:block" : "block"}>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.headClassName}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
              {hasFilters && (
                <TableFilterRow>
                  {columns.map((col) => (
                    <TableFilterCell key={col.key}>
                      {col.filterOptions ? (
                        <TableFilterSelect
                          aria-label={`Filter ${typeof col.header === "string" ? col.header : col.key}`}
                          value={filters[col.key] ?? ""}
                          onChange={(e) => setFilter(col.key, e.target.value)}
                        >
                          <option value="">Semua</option>
                          {col.filterOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </TableFilterSelect>
                      ) : col.filterValue ? (
                        <TableFilterInput
                          aria-label={`Filter ${typeof col.header === "string" ? col.header : col.key}`}
                          placeholder="Filter..."
                          value={filters[col.key] ?? ""}
                          onChange={(e) => setFilter(col.key, e.target.value)}
                        />
                      ) : null}
                    </TableFilterCell>
                  ))}
                </TableFilterRow>
              )}
            </TableHeader>
            <TableBody>
              {pageRows.map((row, i) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.cellClassName}>
                      {col.cell(row, pagination.start + i)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-slate-500 py-8">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TableContainer>
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={pagination.setPage}
        totalItems={filteredRows.length}
        pageSize={pagination.pageSize}
      />
    </>
  );
}
