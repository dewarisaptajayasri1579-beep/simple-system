import React from "react";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  color?: "primary" | "white" | "slate";
  className?: string;
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  color = "primary",
  className = "",
  label,
}) => {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-3",
    xl: "w-12 h-12 border-4",
  };

  const colorClasses = {
    primary: "border-blue-200 border-t-blue-700",
    white: "border-white/30 border-t-white",
    slate: "border-slate-200 border-t-slate-700",
  };

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className={`rounded-full animate-spin ${sizeClasses[size]} ${colorClasses[color]}`}
        role="status"
      />
      {label && <span className="text-sm font-semibold text-slate-700">{label}</span>}
    </div>
  );
};

export const LoadingOverlay: React.FC<{ message?: string }> = ({ message = "Memuat data..." }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
    <div className="glass-card p-6 rounded-2xl flex flex-col items-center gap-3 shadow-xl">
      <Spinner size="xl" color="primary" />
      <p className="text-sm font-bold text-slate-800">{message}</p>
    </div>
  </div>
);
