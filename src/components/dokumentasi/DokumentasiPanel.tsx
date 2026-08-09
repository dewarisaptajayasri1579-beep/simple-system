"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription, Alert } from "@/components/ui";
import { FlowTimeline } from "./FlowTimeline";
import { domainClientSteps, domainInternalSteps, domainCaveats } from "./domain-flow";

const DOC_TABS = [
  { value: "domain", label: "Domain" },
  { value: "server", label: "Server" },
  { value: "maintenance", label: "Maintenance" },
  { value: "biaya-berkala", label: "Biaya Berkala" },
  { value: "penjualan", label: "Penjualan & Invoice" },
  { value: "pembayaran", label: "Pembayaran" },
  { value: "coa", label: "COA & Laporan" },
] as const;

type DocTab = (typeof DOC_TABS)[number]["value"];

/** Placeholder buat tab yang belum ada isinya — dokumentasi ditulis satu-satu per modul,
 *  jangan dikarang sebelum alurnya dicek langsung ke kode (lihat pola domain-flow.ts). */
const ComingSoon: React.FC<{ label: string }> = ({ label }) => (
  <Card variant="feature" padding="lg">
    <p className="text-sm text-slate-500">Dokumentasi alur {label} belum ditulis.</p>
  </Card>
);

const DomainDoc: React.FC = () => (
  <div className="space-y-6">
    <Card variant="panel" padding="lg">
      <CardTitle>Jalur A — Domain milik Client</CardTitle>
      <CardDescription>Input master data → Dashboard → Tagihan → Pembayaran → COA</CardDescription>
      <div className="mt-6">
        <FlowTimeline steps={domainClientSteps} />
      </div>
    </Card>

    <Card variant="panel" padding="lg">
      <CardTitle>Jalur B — Domain Internal (tanpa Client)</CardTitle>
      <CardDescription>Tidak pernah lewat Invoice/Piutang/Payment — langsung jadi pengeluaran.</CardDescription>
      <div className="mt-6">
        <FlowTimeline steps={domainInternalSteps} accent="slate" />
      </div>
    </Card>

    <Alert variant="warning">
      <p className="font-bold mb-2">Yang perlu diwaspadai (bukan bug, tapi gampang salah paham)</p>
      <ul className="space-y-2 list-disc list-inside">
        {domainCaveats.map((c, i) => (
          <li key={i} className="text-sm">
            {c}
          </li>
        ))}
      </ul>
    </Alert>
  </div>
);

/** Menu Dokumentasi — alur tiap modul (Domain, Server, dst) ditulis di sini biar staf baru
 *  bisa lihat langsung di aplikasi tanpa buka kode. Konten diverifikasi ke kode nyata dulu
 *  (lihat Check-Flow.MD di root repo buat draft sebelum dipindah ke sini). */
export const DokumentasiPanel: React.FC = () => {
  const [tab, setTabState] = useState<DocTab>("domain");

  useEffect(() => {
    const saved = window.localStorage.getItem("dokumentasi:tab");
    if (saved && DOC_TABS.some((t) => t.value === saved)) setTabState(saved as DocTab);
  }, []);

  const setTab = (value: DocTab) => {
    setTabState(value);
    window.localStorage.setItem("dokumentasi:tab", value);
  };

  return (
    <div className="space-y-5">
      <div className="p-1 rounded-2xl bg-white/90 border border-slate-200/90 shadow-2xs flex items-center gap-1 flex-wrap w-fit">
        {DOC_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === t.value ? "bg-[#0544cc] text-white shadow-md shadow-blue-700/20" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "domain" && <DomainDoc />}
      {tab === "server" && <ComingSoon label="Server" />}
      {tab === "maintenance" && <ComingSoon label="Maintenance" />}
      {tab === "biaya-berkala" && <ComingSoon label="Biaya Berkala" />}
      {tab === "penjualan" && <ComingSoon label="Penjualan & Invoice" />}
      {tab === "pembayaran" && <ComingSoon label="Pembayaran" />}
      {tab === "coa" && <ComingSoon label="COA & Laporan" />}
    </div>
  );
};
