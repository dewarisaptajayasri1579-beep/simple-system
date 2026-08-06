"use client";

import React, { useEffect, useState } from "react";

export interface CurrencyInputProps {
  label?: string;
  helperText?: string;
  error?: string;
  value: number;
  onChange: (value: number) => void;
  sizeVariant?: "sm" | "md" | "lg";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function formatThousands(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}

function parseDigits(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

/** Input nominal uang — nampilin format ribuan (titik) selagi diketik (mis. "1.500.000"),
 *  tapi `value`/`onChange` tetap angka polos. Dipakai buat SEMUA field nominal uang di app ini
 *  (bukan qty, persentase, atau field angka non-uang lain — itu tetap pakai <Input type="number">
 *  biasa). Kalau bikin form input nominal uang baru, pakai komponen ini, jangan Input biasa. */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ label, helperText, error, value, onChange, sizeVariant = "lg", placeholder = "0", disabled, className = "", id }, ref) => {
    const [display, setDisplay] = useState(() => formatThousands(value));

    useEffect(() => {
      setDisplay(formatThousands(value));
    }, [value]);

    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    const sizeClasses = {
      sm: "h-10 text-xs pl-9 pr-3 rounded-xl",
      md: "h-12 text-sm pl-10 pr-4 rounded-xl",
      lg: "h-14 text-base pl-10 pr-4 rounded-2xl",
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseDigits(e.target.value);
      setDisplay(formatThousands(parsed));
      onChange(parsed);
    };

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={generatedId} className="text-xs sm:text-sm font-bold text-slate-700 select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          <span className="absolute left-3.5 text-slate-500 font-semibold text-xs sm:text-sm pointer-events-none">Rp</span>
          <input
            ref={ref}
            id={generatedId}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            placeholder={placeholder}
            value={display}
            onChange={handleChange}
            className={`w-full ${sizeClasses[sizeVariant]} bg-white/60 hover:bg-white/80 border border-slate-200/80 text-slate-800 placeholder:text-slate-400 font-medium text-right transition-all duration-200 focus:outline-none focus:bg-white/95 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-md shadow-[0_2px_6px_rgba(0,0,0,0.02)] disabled:opacity-50 disabled:cursor-not-allowed ${
              error ? "border-red-500 focus:ring-red-500/10 focus:border-red-500" : ""
            } ${className}`}
          />
        </div>
        {error ? (
          <span className="text-xs font-semibold text-red-500">{error}</span>
        ) : helperText ? (
          <span className="text-xs font-medium text-slate-500">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
