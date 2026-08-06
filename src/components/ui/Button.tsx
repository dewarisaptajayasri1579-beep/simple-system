import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "glass" | "danger" | "success";
  size?: "sm" | "md" | "lg" | "xl";
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "relative inline-flex items-center justify-center font-bold tracking-wide transition-all duration-200 focus:outline-none focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

    const variants = {
      primary:
        "bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white shadow-lg shadow-blue-700/25 hover:shadow-blue-700/40 hover:from-blue-600 hover:to-indigo-800 focus:ring-blue-500/30 border border-blue-600/30",
      secondary:
        "bg-slate-100 text-slate-800 hover:bg-slate-200 focus:ring-slate-400/20 border border-slate-200/80",
      outline:
        "bg-transparent border-2 border-blue-700 text-blue-700 hover:bg-blue-50 focus:ring-blue-500/20",
      ghost:
        "bg-transparent text-slate-700 hover:bg-slate-100 focus:ring-slate-300/20",
      glass:
        "bg-white/80 backdrop-blur-md border border-white/90 text-blue-900 shadow-md hover:bg-white focus:ring-white/50",
      danger:
        "bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-lg shadow-rose-600/25 hover:shadow-rose-600/40 hover:from-rose-500 hover:to-red-600 focus:ring-rose-500/30 border border-rose-600/30",
      success:
        "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:bg-emerald-500 focus:ring-emerald-500/30 border border-emerald-600/30",
    };

    const sizes = {
      sm: "min-h-[38px] px-3.5 text-xs rounded-xl gap-1.5",
      md: "min-h-[44px] px-5 text-sm rounded-2xl gap-2",
      lg: "min-h-[52px] px-6 text-base rounded-2xl gap-2.5",
      xl: "min-h-[60px] px-8 text-lg rounded-2xl gap-3",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${
          fullWidth ? "w-full" : "w-auto"
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <svg
              className="animate-spin h-5 w-5 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>{loadingText || "Memproses..."}</span>
          </div>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children && <span>{children}</span>}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
