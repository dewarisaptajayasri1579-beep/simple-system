import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "feature" | "panel" | "modal" | "solid" | "outline";
  hoverable?: boolean;
  padding?: "none" | "sm" | "md" | "lg" | "xl";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      variant = "glass",
      hoverable = false,
      padding = "lg",
      className = "",
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      glass: "glass-card rounded-[28px]",
      feature: "glass-feature-card rounded-2xl",
      panel: "glass-panel rounded-3xl",
      modal: "glass-modal rounded-[32px]",
      solid: "bg-white border border-slate-200/90 shadow-lg rounded-2xl",
      outline: "bg-white/40 backdrop-blur-md border-2 border-slate-200/80 rounded-2xl",
    };

    const paddingClasses = {
      none: "p-0",
      sm: "p-3 sm:p-4",
      md: "p-5 sm:p-6",
      lg: "p-6 sm:p-8",
      xl: "p-8 sm:p-10",
    };

    const hoverClass = hoverable
      ? "transition-transform duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer"
      : "";

    return (
      <div
        ref={ref}
        className={`${variantClasses[variant]} ${paddingClasses[padding]} ${hoverClass} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <div className={`flex flex-col gap-1 mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <h3
    className={`font-bold text-slate-800 text-lg sm:text-xl tracking-tight ${className}`}
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <p className={`text-xs sm:text-sm text-slate-600 font-medium ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <div className={`w-full ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <div className={`mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between gap-4 ${className}`} {...props}>
    {children}
  </div>
);
