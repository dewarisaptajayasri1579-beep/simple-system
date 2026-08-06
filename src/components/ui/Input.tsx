"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
  sizeVariant?: "sm" | "md" | "lg";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      isPassword,
      sizeVariant = "lg",
      className = "",
      type = "text",
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    const sizeClasses = {
      sm: "h-10 text-xs px-3 rounded-xl",
      md: "h-12 text-sm px-4 rounded-xl",
      lg: "h-14 text-base px-4 rounded-2xl",
    };

    const leftPadding = leftIcon ? (sizeVariant === "sm" ? "pl-9" : "pl-12") : "";
    const rightPadding = isPassword || rightIcon ? (sizeVariant === "sm" ? "pr-9" : "pr-12") : "";

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={generatedId} className="text-xs sm:text-sm font-bold text-slate-700 select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {leftIcon && (
            <div className="absolute left-4 pointer-events-none text-slate-600 flex items-center justify-center z-10">
              {leftIcon}
            </div>
          )}
          <input
            id={generatedId}
            ref={ref}
            type={inputType}
            disabled={disabled}
            className={`w-full ${sizeClasses[sizeVariant]} ${leftPadding} ${rightPadding} bg-white/60 hover:bg-white/80 border border-slate-200/80 text-slate-800 placeholder:text-slate-400 font-medium transition-all duration-200 focus:outline-none focus:bg-white/95 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-md shadow-[0_2px_6px_rgba(0,0,0,0.02)] disabled:opacity-50 disabled:cursor-not-allowed ${
              error ? "border-red-500 focus:ring-red-500/10 focus:border-red-500" : ""
            } ${className}`}
            {...props}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 text-slate-500 hover:text-slate-700 focus:outline-none p-1 rounded-lg transition-colors flex items-center justify-center z-10 cursor-pointer"
              tabIndex={-1}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5 text-slate-600" />
              ) : (
                <Eye className="w-5 h-5 text-slate-600" />
              )}
            </button>
          ) : rightIcon ? (
            <div className="absolute right-4 text-slate-600 pointer-events-none flex items-center justify-center z-10">
              {rightIcon}
            </div>
          ) : null}
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

Input.displayName = "Input";
