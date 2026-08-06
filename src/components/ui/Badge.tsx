import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  dot = false,
  className = "",
  ...props
}) => {
  const variantClasses = {
    primary: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    secondary: "bg-slate-500/15 text-slate-700 border-slate-500/30",
    success: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    danger: "bg-rose-500/15 text-rose-700 border-rose-500/30",
    info: "bg-sky-500/15 text-sky-700 border-sky-500/30",
    outline: "bg-transparent text-slate-700 border-slate-300",
    ghost: "bg-white/60 backdrop-blur-md text-slate-700 border-white/80 shadow-sm",
  };

  const dotClasses = {
    primary: "bg-blue-500",
    secondary: "bg-slate-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-sky-500",
    outline: "bg-slate-400",
    ghost: "bg-blue-600",
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px] gap-1 rounded-md",
    md: "px-2.5 py-1 text-xs gap-1.5 rounded-lg",
    lg: "px-3.5 py-1.5 text-sm gap-2 rounded-xl",
  };

  return (
    <span
      className={`inline-flex items-center font-bold border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-2 h-2 rounded-full ${dotClasses[variant]} animate-pulse`} />}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
