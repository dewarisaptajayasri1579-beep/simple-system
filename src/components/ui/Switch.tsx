"use client";

import React from "react";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  helperText?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, helperText, className = "", disabled, id, ...props }, ref) => {
    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="inline-flex flex-col gap-1">
        <label
          htmlFor={generatedId}
          className={`inline-flex items-center gap-2.5 select-none ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className="relative inline-flex items-center flex-shrink-0 w-10 h-[22px]">
            <input
              id={generatedId}
              ref={ref}
              type="checkbox"
              role="switch"
              disabled={disabled}
              className="peer appearance-none w-10 h-[22px] rounded-full bg-slate-300 transition-colors duration-200 checked:bg-[#0544cc] focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed"
              {...props}
            />
            <span className="pointer-events-none absolute left-[3px] top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-[18px]" />
          </span>
          {label && <span className="text-sm font-semibold text-slate-700">{label}</span>}
        </label>
        {helperText && <span className="text-xs font-medium text-slate-500">{helperText}</span>}
      </div>
    );
  }
);

Switch.displayName = "Switch";
