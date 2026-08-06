"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, Button, Input, FilterableTable, type FilterableColumn } from "@/components/ui";
import { Plus } from "lucide-react";

export interface FollowUpRow {
  id: string;
  subject: string;
  note: string;
  followUpDate: string;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

export const FollowUpPanel: React.FC<{ rows: FollowUpRow[] }> = ({ rows: initialRows }) => {
  const [rows, setRows] = useState(initialRows);
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [submitting, setSubmitting] = useState(false);

  const columns: FilterableColumn<FollowUpRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "date", header: "Tanggal", headClassName: "w-32", filterValue: (r) => formatDate(r.followUpDate), cell: (r) => formatDate(r.followUpDate) },
    { key: "subject", header: "Subjek", filterValue: (r) => r.subject, cellClassName: "font-semibold", cell: (r) => r.subject },
    { key: "note", header: "Catatan", filterValue: (r) => r.note, cell: (r) => r.note },
  ];

  const handleAdd = async () => {
    if (!subject.trim() || !note.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, note, followUpDate: date }),
      });
      if (res.ok) {
        const created = await res.json();
        setRows((prev) => [created, ...prev]);
        setSubject("");
        setNote("");
        setDate(todayInputValue());
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6">
        <CardHeader>
          <CardTitle>Daftar Follow Up</CardTitle>
          <CardDescription>{rows.length} catatan</CardDescription>
        </CardHeader>
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage="Belum ada catatan follow-up." />
      <div className="flex flex-col sm:flex-row gap-2 p-5 sm:p-6 pt-4 border-t border-slate-200/60">
        <Input sizeVariant="sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input sizeVariant="sm" placeholder="Subjek (mis. Domain SMP N 1 Selo)" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Input sizeVariant="sm" placeholder="Catatan (mis. Tidak diperpanjang)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={submitting} leftIcon={<Plus className="w-4 h-4" />}>
          Tambah
        </Button>
      </div>
    </Card>
  );
};
