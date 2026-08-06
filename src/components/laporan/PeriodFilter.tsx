"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input, Button } from "@/components/ui";

export const PeriodFilter: React.FC<{ fromIso: string; toIso: string }> = ({ fromIso, toIso }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(fromIso);
  const [to, setTo] = useState(toIso);

  const apply = () => {
    router.push(`${pathname}?from=${from}&to=${to}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input label="Dari" type="date" sizeVariant="sm" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Input label="Sampai" type="date" sizeVariant="sm" value={to} onChange={(e) => setTo(e.target.value)} />
      <Button variant="outline" size="sm" onClick={apply}>
        Terapkan
      </Button>
    </div>
  );
};
