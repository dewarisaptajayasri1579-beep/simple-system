import React from "react";

export interface SkeletonProps {
  variant?: "text" | "circle" | "rect";
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ variant = "text", width, height, className = "" }) => {
  const shapeClasses = {
    text: "h-4 rounded-md w-full",
    circle: "rounded-full aspect-square",
    rect: "rounded-2xl w-full",
  };

  return (
    <div
      className={`bg-slate-200/70 animate-pulse ${shapeClasses[variant]} ${className}`}
      style={{ width, height: height ?? (variant === "circle" ? width : undefined) }}
      aria-hidden="true"
    />
  );
};

/** Beberapa baris skeleton — dipakai untuk list/tabel yang sedang loading. */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({ rows = 5, className = "" }) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} variant="rect" height={56} />
    ))}
  </div>
);
