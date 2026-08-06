import React from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

export interface AlertProps {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  title,
  children,
  onClose,
  className = "",
}) => {
  const configs = {
    info: {
      bg: "bg-sky-50/90 border-sky-200/90 text-sky-900",
      icon: <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />,
    },
    success: {
      bg: "bg-emerald-50/90 border-emerald-200/90 text-emerald-900",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />,
    },
    warning: {
      bg: "bg-amber-50/90 border-amber-200/90 text-amber-900",
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />,
    },
    error: {
      bg: "bg-rose-50/90 border-rose-200/90 text-rose-900",
      icon: <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />,
    },
  };

  const config = configs[variant];

  return (
    <div
      className={`p-4 rounded-2xl border backdrop-blur-md flex items-start gap-3 shadow-xs ${config.bg} ${className}`}
    >
      {config.icon}
      <div className="flex-1">
        {title && <h4 className="font-bold text-sm mb-1">{title}</h4>}
        <div className="text-xs sm:text-sm font-medium leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
          aria-label="Tutup alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
