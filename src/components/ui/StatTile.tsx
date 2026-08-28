import React from "react";
import type { LucideIcon } from "lucide-react";

import { Card } from "./Card";

export interface StatTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  color?: "blue" | "emerald" | "amber" | "rose" | "purple" | "slate" | "indigo";
  hint?: string;
  href?: string;
  className?: string;
}

const VALUE_COLOR: Record<NonNullable<StatTileProps["color"]>, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
  purple: "text-violet-600",
  indigo: "text-indigo-600",
  slate: "text-slate-900",
};

const ICON_WRAP: Record<NonNullable<StatTileProps["color"]>, string> = {
  blue: "bg-blue-500/15 text-blue-700",
  emerald: "bg-emerald-500/15 text-emerald-700",
  amber: "bg-amber-500/15 text-amber-700",
  rose: "bg-rose-500/15 text-rose-700",
  purple: "bg-purple-500/15 text-purple-700",
  indigo: "bg-indigo-500/15 text-indigo-700",
  slate: "bg-slate-500/15 text-slate-700",
};

export const StatTile: React.FC<StatTileProps> = ({ label, value, icon: Icon, color = "slate", hint, className = "" }) => (
  <Card variant="feature" padding="md" className={className}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-black mt-1 truncate ${VALUE_COLOR[color]}`}>{value}</p>
        {hint && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{hint}</p>}
      </div>
      {Icon && (
        <span className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${ICON_WRAP[color]}`}>
          <Icon className="w-5 h-5" />
        </span>
      )}
    </div>
  </Card>
);
