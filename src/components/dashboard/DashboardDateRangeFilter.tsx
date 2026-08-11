"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input, Button } from "@/components/ui";

/** Filter jatuh tempo untuk section Domain/Server/Maintenance/Biaya di Dashboard. Kosong (default)
 *  = pakai window bawaan tiap section (lewat tempo/bulan ini/bulan depan). Begitu diisi & "Terapkan"
 *  diklik, section-section itu ganti ke mode custom: tampilkan SEMUA item jatuh tempo sampai
 *  tanggal ini — item yang sudah lewat tempo atau jatuh tempo hari ini tetap selalu ikut muncul. */
export const DashboardDateRangeFilter: React.FC<{ toIso: string }> = ({ toIso }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [to, setTo] = useState(toIso);

  const apply = () => {
    const qs = new URLSearchParams();
    if (to) qs.set("to", to);
    router.push(qs.toString() ? `${pathname}?${qs.toString()}` : pathname);
  };

  const reset = () => {
    setTo("");
    router.push(pathname);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input label="Jatuh Tempo Sampai" type="date" sizeVariant="sm" value={to} onChange={(e) => setTo(e.target.value)} />
      <Button variant="outline" size="sm" onClick={apply}>
        Terapkan
      </Button>
      {toIso && (
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
      )}
    </div>
  );
};
