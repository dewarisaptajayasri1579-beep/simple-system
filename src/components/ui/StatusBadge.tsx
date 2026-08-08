import React from "react";

export type StatusBadgeType =
  | "safe"
  | "expiring_next_month"
  | "expiring_this_month"
  | "expired"
  | "unpaid"
  | "partial"
  | "paid"
  | "claimed_paid"
  | "inactive"
  | "draft"
  | "posted"
  | "voided";

export interface StatusBadgeProps {
  type: StatusBadgeType;
  label?: string;
  count?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  type,
  label,
  count,
  size = "md",
  className = "",
}) => {
  const config = {
    safe: {
      defaultLabel: "Aman",
      bgColor: "bg-emerald-500/15",
      textColor: "text-emerald-700",
      borderColor: "border-emerald-500/30",
      dotColor: "bg-emerald-500",
      badgeColor: "bg-emerald-600 text-white",
    },
    expiring_next_month: {
      defaultLabel: "Bulan Depan",
      bgColor: "bg-sky-500/15",
      textColor: "text-sky-700",
      borderColor: "border-sky-500/30",
      dotColor: "bg-sky-500",
      badgeColor: "bg-sky-600 text-white",
    },
    expiring_this_month: {
      defaultLabel: "Bulan Ini",
      bgColor: "bg-amber-500/15",
      textColor: "text-amber-700",
      borderColor: "border-amber-500/30",
      dotColor: "bg-amber-500",
      badgeColor: "bg-amber-600 text-white",
    },
    expired: {
      defaultLabel: "Sudah Lewat",
      bgColor: "bg-rose-500/15",
      textColor: "text-rose-700",
      borderColor: "border-rose-500/30",
      dotColor: "bg-rose-500",
      badgeColor: "bg-rose-600 text-white",
    },
    unpaid: {
      defaultLabel: "Belum Dibayar",
      bgColor: "bg-rose-500/15",
      textColor: "text-rose-700",
      borderColor: "border-rose-500/30",
      dotColor: "bg-rose-500",
      badgeColor: "bg-rose-600 text-white",
    },
    partial: {
      defaultLabel: "Dicicil",
      bgColor: "bg-amber-500/15",
      textColor: "text-amber-700",
      borderColor: "border-amber-500/30",
      dotColor: "bg-amber-500",
      badgeColor: "bg-amber-600 text-white",
    },
    paid: {
      defaultLabel: "Lunas",
      bgColor: "bg-emerald-500/15",
      textColor: "text-emerald-700",
      borderColor: "border-emerald-500/30",
      dotColor: "bg-emerald-500",
      badgeColor: "bg-emerald-600 text-white",
    },
    claimed_paid: {
      defaultLabel: "Diklaim Lunas (belum diverifikasi)",
      bgColor: "bg-purple-500/15",
      textColor: "text-purple-700",
      borderColor: "border-purple-500/30",
      dotColor: "bg-purple-500",
      badgeColor: "bg-purple-600 text-white",
    },
    inactive: {
      defaultLabel: "Nonaktif",
      bgColor: "bg-slate-500/15",
      textColor: "text-slate-700",
      borderColor: "border-slate-500/30",
      dotColor: "bg-slate-500",
      badgeColor: "bg-slate-600 text-white",
    },
    draft: {
      defaultLabel: "Draft",
      bgColor: "bg-slate-500/15",
      textColor: "text-slate-600",
      borderColor: "border-slate-500/30",
      dotColor: "bg-slate-400",
      badgeColor: "bg-slate-500 text-white",
    },
    posted: {
      defaultLabel: "Posted",
      bgColor: "bg-emerald-500/15",
      textColor: "text-emerald-700",
      borderColor: "border-emerald-500/30",
      dotColor: "bg-emerald-500",
      badgeColor: "bg-emerald-600 text-white",
    },
    voided: {
      defaultLabel: "Dibatalkan",
      bgColor: "bg-rose-500/10",
      textColor: "text-rose-600",
      borderColor: "border-rose-500/30",
      dotColor: "bg-rose-400",
      badgeColor: "bg-rose-500 text-white",
    },
  };

  const style = config[type] || config.safe;
  const displayLabel = label || style.defaultLabel;

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5 rounded-lg",
    md: "px-3.5 py-1.5 text-sm gap-2 rounded-xl",
    lg: "px-4 py-2 text-base gap-2.5 rounded-2xl",
  };

  return (
    <div
      className={`inline-flex items-center font-bold border backdrop-blur-md shadow-xs ${style.bgColor} ${style.textColor} ${style.borderColor} ${sizeClasses[size]} ${className}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${style.dotColor} animate-pulse`} />
      <span>{displayLabel}</span>
      {count !== undefined && (
        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-black ${style.badgeColor}`}>
          {count}
        </span>
      )}
    </div>
  );
};
