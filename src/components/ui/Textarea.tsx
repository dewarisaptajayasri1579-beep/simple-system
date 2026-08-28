"use client";

import React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  sizeVariant?: "sm" | "md" | "lg";
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helperText, error, sizeVariant = "md", className = "", disabled, id, rows = 3, ...props }, ref) => {
    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    const sizeClasses = {
      sm: "min-h-[72px] text-xs px-3 py-2 rounded-xl",
      md: "min-h-[92px] text-sm px-3.5 py-2.5 rounded-xl",
      lg: "min-h-[120px] text-base px-4 py-3 rounded-2xl",
    };

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={generatedId} className="text-xs sm:text-sm font-bold text-slate-700 select-none">
            {label}
          </label>
        )}
        <textarea
          id={generatedId}
          ref={ref}
          rows={rows}
          disabled={disabled}
          className={`w-full ${sizeClasses[sizeVariant]} bg-white/60 hover:bg-white/80 border border-slate-200/80 text-slate-800 placeholder:text-slate-400 font-medium transition-all duration-200 focus:outline-none focus:bg-white/95 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-md shadow-[0_2px_6px_rgba(0,0,0,0.02)] disabled:opacity-50 disabled:cursor-not-allowed resize-y ${
            error ? "border-red-500 focus:ring-red-500/10 focus:border-red-500" : ""
          } ${className}`}
          {...props}
        />
        {error ? (
          <span className="text-xs font-semibold text-red-500">{error}</span>
        ) : helperText ? (
          <span className="text-xs font-medium text-slate-500">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
