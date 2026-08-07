"use client";

import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomBar } from "./BottomBar";
import { CommandPalette } from "./CommandPalette";
import { MotivationalQuote } from "../ui/MotivationalQuote";

export interface AppLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, userName, userRole }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-app-mesh text-slate-800 font-sans flex relative overflow-x-clip">
      <div className="fixed -top-40 -left-40 w-[500px] h-[500px] bg-blue-400/20 rounded-full blur-3xl pointer-events-none animate-pulse-subtle" />
      <div className="fixed -bottom-40 -right-40 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-3xl pointer-events-none animate-pulse-subtle" />

      <div className="no-print contents">
        <Sidebar isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed((p) => !p)} />
      </div>

      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarCollapsed ? "lg:pl-20" : "lg:pl-64"}`}>
        <div className="no-print contents">
          <Header userName={userName} userRole={userRole} />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8 relative z-10 max-w-7xl w-full mx-auto">
          {children}
        </main>

        <footer className="no-print hidden lg:flex flex-col items-center gap-1 py-4 px-6 text-center text-xs text-slate-500 font-semibold border-t border-slate-200/60 z-10">
          <MotivationalQuote />
          <p>&copy; {new Date().getFullYear()} SEVEN OS — Sistem Internal.</p>
        </footer>
      </div>

      <div className="no-print contents">
        <BottomBar />
      </div>

      <CommandPalette />
    </div>
  );
};
