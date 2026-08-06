import React from "react";

interface AppLogoAltProps {
  size?: "sm" | "md" | "lg" | "xl";
  layout?: "horizontal" | "vertical";
  showTagline?: boolean;
  iconOnly?: boolean;
  textColor?: string;
  className?: string;
}

/** Varian alternatif dari AppLogo — badge kotak membulat (bukan lingkaran+diamond) dengan
 *  angka "7" tegas dan aksen garis emas di bawahnya. Dipakai buat favicon (lihat app/icon.svg,
 *  file SVG yang sama persis dgn ikon di komponen ini) dan tersedia sbg komponen kalau mau
 *  dipasang gantikan AppLogo di tempat lain nanti. */
export const AppLogoAlt: React.FC<AppLogoAltProps> = ({
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
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md select-none">
          <rect x="12" y="12" width="176" height="176" rx="48" fill="#132A63" />
          <rect x="12" y="12" width="176" height="176" rx="48" fill="none" stroke="#3B82F6" strokeOpacity="0.4" strokeWidth="5" />
          <text x="100" y="148" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="128" fontWeight="800" fill="#FFFFFF">
            7
          </text>
          <rect x="68" y="160" width="64" height="11" rx="5.5" fill="#F5B301" />
        </svg>
      </div>

      {!iconOnly && (
        <div className={layout === "vertical" ? "mt-3" : ""}>
          <h1 className={`font-black tracking-tight leading-none ${textColor} ${titleSizes[size]}`}>SEVEN OS</h1>
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
