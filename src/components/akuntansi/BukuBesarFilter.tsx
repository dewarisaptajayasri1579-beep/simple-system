"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Select, Input } from "@/components/ui";

export const BukuBesarFilter: React.FC<{
  accountId: string;
  accountOptions: { value: string; label: string }[];
  month: string;
}> = ({ accountId, accountOptions, month }) => {
  const router = useRouter();
  const pathname = usePathname();

  const [account, setAccount] = useState(accountId);
  const [monthValue, setMonthValue] = useState(month);

  const push = (nextAccount: string, nextMonth: string) => {
    router.push(`${pathname}?accountId=${nextAccount}&month=${nextMonth}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-72">
        <Select
          label="Akun COA"
          options={accountOptions}
          value={account}
          onChange={(v) => {
            setAccount(v);
            push(v, monthValue);
          }}
          searchPlaceholder="Cari akun..."
        />
      </div>
      <Input
        label="Periode (Bulan)"
        type="month"
        sizeVariant="lg"
        value={monthValue}
        onChange={(e) => {
          setMonthValue(e.target.value);
          push(account, e.target.value);
        }}
      />
    </div>
  );
};
