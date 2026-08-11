"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input, Button } from "@/components/ui";

/** Filter rentang tanggal jatuh tempo untuk section Domain/Server/Maintenance/Biaya di Dashboard.
 *  Kosong (default) = pakai window bawaan tiap section (lewat tempo/bulan ini/bulan depan). Begitu
 *  salah satu tanggal diisi & "Terapkan" diklik, section-section itu ganti ke mode rentang custom
 *  dan menampilkan SEMUA item yang jatuh tempo dalam rentang tsb (termasuk yang masih jauh/"Aman"). */
export const DashboardDateRangeFilter: React.FC<{ fromIso: string; toIso: string }> = ({ fromIso, toIso }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(fromIso);
  const [to, setTo] = useState(toIso);

  const apply = () => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    router.push(qs.toString() ? `${pathname}?${qs.toString()}` : pathname);
  };

  const reset = () => {
    setFrom("");
    setTo("");
    router.push(pathname);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input label="Jatuh Tempo Dari" type="date" sizeVariant="sm" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Input label="Sampai" type="date" sizeVariant="sm" value={to} onChange={(e) => setTo(e.target.value)} />
      <Button variant="outline" size="sm" onClick={apply}>
        Terapkan
      </Button>
      {(fromIso || toIso) && (
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
      )}
    </div>
  );
};
