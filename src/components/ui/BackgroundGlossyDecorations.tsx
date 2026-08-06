import React from "react";

export const BackgroundGlossyDecorations: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* 1. Sparkle Glint / Lens Flare Stars */}
      <div className="absolute top-12 left-[48%] animate-sparkle">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z"
            fill="url(#sparkleGrad1)"
          />
          <defs>
            <linearGradient id="sparkleGrad1" x1="0" y1="0" x2="24" y2="24">
              <stop stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#93C5FD" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="absolute top-28 left-[15%] animate-sparkle" style={{ animationDelay: "1.5s" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z"
            fill="#FFFFFF"
          />
        </svg>
      </div>

      <div className="absolute top-[40%] right-[10%] animate-sparkle" style={{ animationDelay: "2.5s" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z"
            fill="url(#sparkleGrad2)"
          />
          <defs>
            <linearGradient id="sparkleGrad2" x1="0" y1="0" x2="24" y2="24">
              <stop stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#60A5FA" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* 2. Floating Glossy Medical Cross (PMI) Badge */}
      <div className="absolute top-16 right-[38%] animate-float-slow">
        <div className="w-14 h-14 rounded-full glossy-bubble flex items-center justify-center shadow-lg">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 4V20M4 12H20"
              stroke="#2563EB"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* 3. Floating Glossy Heart + Heartbeat (ECG) Badge */}
      <div className="absolute top-28 right-[46%] animate-float-delayed">
        <div className="w-12 h-12 rounded-full glossy-bubble flex items-center justify-center shadow-md">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2"
            />
            <path
              d="M7 12h2.5l1.5-3 2 6 1.5-3H17"
              stroke="#3B82F6"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* 4. Glossy Translucent Bubbles (Bokeh effect matching mockup) */}
      <div className="absolute top-[35%] right-[32%] w-10 h-10 rounded-full glossy-bubble animate-float-slow" />
      <div className="absolute bottom-[28%] left-[45%] w-8 h-8 rounded-full glossy-bubble animate-float-delayed" />
      <div className="absolute bottom-[18%] right-[25%] w-14 h-14 rounded-full glossy-bubble animate-float-slow" />
      <div className="absolute top-[10%] left-[8%] w-12 h-12 rounded-full glossy-bubble animate-float-delayed" />

      {/* 5. Curved Light Mesh Rays */}
      <svg
        className="absolute inset-0 w-full h-full opacity-30"
        viewBox="0 0 1200 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M-100 200 C300 50, 700 350, 1300 150"
          stroke="url(#rayGrad1)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M-100 600 C400 400, 800 700, 1300 500"
          stroke="url(#rayGrad2)"
          strokeWidth="2"
        />
        <defs>
          <linearGradient id="rayGrad1" x1="0" y1="0" x2="1200" y2="0">
            <stop stopColor="#93C5FD" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="rayGrad2" x1="0" y1="0" x2="1200" y2="0">
            <stop stopColor="#60A5FA" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#93C5FD" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
