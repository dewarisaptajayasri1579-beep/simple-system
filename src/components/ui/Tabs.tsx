"use client";

import React, { createContext, useContext, useState } from "react";

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab/TabPanel harus dipakai di dalam <Tabs>");
  return ctx;
}

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

/** Controlled kalau `value` diberikan, uncontrolled kalau tidak. */
export const Tabs: React.FC<TabsProps> = ({ value, defaultValue, onChange, children, className = "" }) => {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const activeValue = value ?? internalValue;

  const setValue = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value: activeValue, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabList: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div role="tablist" className={`flex items-center gap-1 border-b border-slate-200/80 overflow-x-auto ${className}`}>
    {children}
  </div>
);

export interface TabProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export const Tab: React.FC<TabProps> = ({ value, children, disabled }) => {
  const { value: activeValue, setValue } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={`relative px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive ? "text-blue-700" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
      {isActive && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-[#0544cc]" />}
    </button>
  );
};

export const TabPanels: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`pt-4 ${className}`}>{children}</div>
);

export const TabPanel: React.FC<{ value: string; children: React.ReactNode; className?: string }> = ({
  value,
  children,
  className = "",
}) => {
  const { value: activeValue } = useTabsContext();
  if (activeValue !== value) return null;
  return <div role="tabpanel" className={className}>{children}</div>;
};
