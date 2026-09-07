"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import type { AccountOption } from "./AccountPicker";
import { KasKeluarForm } from "./KasKeluarForm";
import { ChevronLeft } from "lucide-react";
import { type BillItemOption } from "./kasKeluarShared";

/** Versi halaman penuh dari input Kas Keluar (alternatif dari versi modal di KasKeluarPanel) —
 *  form sama persis (reuse KasKeluarForm), cuma beda chrome halaman & perilaku setelah simpan:
 *  redirect ke detail transaksi (1 baris) atau balik ke daftar Kas Keluar (>1 baris). */
export const KasKeluarNewPagePanel: React.FC<{
  accounts: AccountOption[];
  domains: BillItemOption[];
  servers: BillItemOption[];
  maintenances: BillItemOption[];
  recurringBills: BillItemOption[];
  isOwner: boolean;
}> = ({ accounts, domains, servers, maintenances, recurringBills, isOwner }) => {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/keuangan/kas-keluar" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-3.5 h-3.5" />
          Kas Keluar
        </Link>
        <div className="mt-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Input Kas Keluar</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Catat pengeluaran kas/bank — biaya manual maupun Bayar Domain/Server/Biaya Berkala, boleh lebih dari 1 baris sekaligus.
          </p>
        </div>
      </div>

      <Card variant="panel" padding="lg">
        <CardTitle>Input Kas Keluar</CardTitle>
        <div className="mt-4">
          <KasKeluarForm
            accounts={accounts}
            domains={domains}
            servers={servers}
            maintenances={maintenances}
            recurringBills={recurringBills}
            isOwner={isOwner}
            onSaved={(transactionIds) => {
              // Kalau cuma 1 baris yang disimpan, langsung ke detail transaksinya — kalau lebih
              // dari 1 (input borongan beberapa biaya sekaligus), balik ke daftar Kas Keluar
              // karena tidak ada 1 detail tunggal yang mewakili semuanya.
              if (transactionIds.length === 1) {
                router.push(`/keuangan/transaksi/${transactionIds[0]}`);
                return;
              }
              router.push("/keuangan/kas-keluar");
            }}
          />
        </div>
      </Card>
    </div>
  );
};
