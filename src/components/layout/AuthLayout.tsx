"use client";

import React, { useState } from "react";
import { AppLogo } from "../ui/AppLogo";
import { LoginForm } from "../auth/LoginForm";
import { QuickLoginModal } from "../auth/QuickLoginModal";
import { MotivationalQuote } from "../ui/MotivationalQuote";
import { Receipt, Globe, Landmark } from "lucide-react";

export const AuthLayout: React.FC<{ quickLogin?: boolean }> = ({ quickLogin = false }) => {
  const [showQuickLogin, setShowQuickLogin] = useState(quickLogin);

  return (
    <div className="min-h-screen w-full bg-app-mesh flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans relative overflow-x-hidden">
      <div className="fixed -top-40 -left-40 w-[500px] h-[500px] bg-blue-400/25 rounded-full blur-3xl pointer-events-none animate-pulse-subtle" />
      <div className="fixed -bottom-40 -right-40 w-[500px] h-[500px] bg-indigo-500/25 rounded-full blur-3xl pointer-events-none animate-pulse-subtle" />

      <main className="flex-1 w-full max-w-5xl mx-auto flex items-center justify-center relative z-10 my-auto">
        <div className="hidden lg:grid w-full rounded-[36px] p-8 xl:p-10 shadow-[0_30px_70px_-15px_rgba(15,37,85,0.22)] grid-cols-12 gap-8 items-center border-2 border-white/90 relative overflow-hidden bg-white/70 backdrop-blur-xl">
          <div className="col-span-7 flex flex-col justify-between h-full pr-4 space-y-6 relative z-10 min-h-[480px]">
            <div className="space-y-4">
              <AppLogo size="lg" layout="horizontal" showTagline />
              <div className="w-16 h-1 bg-blue-700 rounded-full my-2 shadow-sm" />
              <p className="text-slate-700 font-semibold text-base leading-relaxed max-w-lg">
                Kelola piutang, invoice, domain, biaya berkala, dan kas &amp; bank dalam satu tempat.
              </p>
            </div>

            <div className="flex-1" />

            <div className="grid grid-cols-3 gap-3.5 pt-2">
              {[
                { icon: Receipt, title: "Piutang Rapi", desc: "Tagihan & pelunasan tercatat" },
                { icon: Globe, title: "Domain Terpantau", desc: "Reminder sebelum expired" },
                { icon: Landmark, title: "Kas Transparan", desc: "Split otomatis tiap transaksi" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="glass-mockup-feature-card p-3.5 sm:p-4 rounded-2xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/90 border border-blue-100/90 text-[#0544cc] shadow-sm flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{title}</h4>
                    <p className="text-[11px] text-slate-600 font-medium leading-tight mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-5 flex justify-center relative z-10">
            <div className="w-full max-w-md glass-mockup-card p-8 sm:p-10 rounded-[32px]">
              <LoginForm showTopLockIcon />
            </div>
          </div>
        </div>

        <div className="flex lg:hidden w-full max-w-sm sm:max-w-md mx-auto flex-col items-center justify-center space-y-6 py-4 relative">
          <div className="text-center flex flex-col items-center relative z-10">
            <AppLogo size="xl" layout="vertical" showTagline />
          </div>
          <div className="w-full glass-mockup-card p-7 sm:p-9 rounded-[32px] relative z-10">
            <LoginForm showTopLockIcon={false} />
          </div>
        </div>
      </main>

      <footer className="mt-6 flex flex-col items-center gap-1 text-center text-xs text-slate-600 font-semibold z-10">
        <MotivationalQuote />
        <p>&copy; {new Date().getFullYear()} SEVEN OS — Sistem Internal.</p>
      </footer>

      <QuickLoginModal open={showQuickLogin} onManualLogin={() => setShowQuickLogin(false)} />
    </div>
  );
};
