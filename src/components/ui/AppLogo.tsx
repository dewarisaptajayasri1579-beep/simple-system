import React from "react";

interface AppLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  layout?: "horizontal" | "vertical";
  showTagline?: boolean;
  iconOnly?: boolean;
  textColor?: string;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = "md",
  layout = "horizontal",
  showTagline = true,
  iconOnly = false,
  textColor = "text-[#1B357A]",
  className = "",
}) => {
  const iconSizes = {
    sm: "w-9 h-9",
    md: "w-16 h-16",
    lg: "w-22 h-22 lg:w-24 lg:h-24",
    xl: "w-28 h-28 sm:w-32 sm:h-32",
  };

  const titleSizes = {
    sm: "text-lg",
    md: "text-3xl",
    lg: "text-4xl xl:text-5xl",
    xl: "text-4xl sm:text-5xl",
  };

  const subtitleSizes = {
    sm: "text-[10px]",
    md: "text-sm",
    lg: "text-base xl:text-lg",
    xl: "text-sm sm:text-base",
  };

  return (
    <div
      className={`flex ${
        layout === "vertical" ? "flex-col items-center text-center" : "flex-row items-center gap-3"
      } ${className}`}
    >
      <div className={`relative flex-shrink-0 ${iconSizes[size]}`}>
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-md select-none"
        >
          <ellipse cx="100" cy="186" rx="64" ry="10" fill="#1E3A8A" fillOpacity="0.18" />
          <circle cx="100" cy="104" r="80" fill="#1B357A" />
          <path
            d="M100 44L146 70V122L100 148L54 122V70L100 44Z"
            fill="#FFFFFF"
          />
          <path d="M100 44L146 70L100 96L54 70L100 44Z" fill="#DCE7F7" />
          <path d="M100 96V148L54 122V70L100 96Z" fill="#EEF4FC" />
          <text
            x="100"
            y="103"
            textAnchor="middle"
            fontSize="34"
            fontWeight="800"
            fill="#1B357A"
          >
            7
          </text>
        </svg>
      </div>

      {!iconOnly && (
        <div className={layout === "vertical" ? "mt-3" : ""}>
          <h1 className={`font-black tracking-tight leading-none ${textColor} ${titleSizes[size]}`}>
            SEVEN OS
          </h1>
          {showTagline && (
            <div className={`mt-1.5 font-bold leading-tight ${subtitleSizes[size]}`}>
              <div className="text-blue-600">Sistem Internal</div>
              <div className="text-slate-600 font-semibold">Piutang, Domain & Keuangan</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
