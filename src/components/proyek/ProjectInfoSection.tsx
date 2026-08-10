"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Alert } from "@/components/ui";
import { Pencil } from "lucide-react";

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export interface ProjectInfoSectionProps {
  projectId: string;
  projectName: string;
  clientName: string;
  startDate: string;
  endDate: string | null;
  picName: string | null;
  picPhone: string | null;
}

/** Judul project + Periode (Tgl Mulai/Selesai)/PIC/No WA di header detail Project — dulu cuma
 *  teks statis (cuma bisa diisi sekali waktu bikin project lewat ProjectForm), sekarang bisa
 *  diedit lagi lewat tombol "Edit" di pojok kanan atas. PATCH ke /api/projects/[id], yang sudah
 *  dukung field-field ini sejak lama. */
export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({
  projectId,
  projectName,
  clientName,
  startDate,
  endDate,
  picName,
  picPhone,
}) => {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    startDate: startDate.slice(0, 10),
    endDate: endDate ? endDate.slice(0, 10) : "",
    picName: picName ?? "",
    picPhone: picPhone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    setForm({ startDate: startDate.slice(0, 10), endDate: endDate ? endDate.slice(0, 10) : "", picName: picName ?? "", picPhone: picPhone ?? "" });
    setError("");
    setEditing(true);
  };

  const save = async () => {
    if (!form.startDate) {
      setError("Tanggal mulai wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: form.startDate,
        endDate: form.endDate || null,
        picName: form.picName,
        picPhone: form.picPhone,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan");
      return;
    }
    setEditing(false);
    router.refresh();
  };

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{projectName}</h1>
          <p className="text-sm text-slate-600 font-semibold mt-1">{clientName}</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={startEdit}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-6 pt-6 border-t border-slate-200/60 space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Tanggal Mulai" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            <Input
              label="Tanggal Selesai (opsional)"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
            <Input label="PIC Proyek" value={form.picName} onChange={(e) => setForm((f) => ({ ...f, picName: e.target.value }))} />
            <Input label="No. WA PIC" value={form.picPhone} onChange={(e) => setForm((f) => ({ ...f, picPhone: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={save} isLoading={saving}>
              Simpan
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Periode</p>
            <p className="font-semibold text-slate-800">
              {formatDate(startDate)} - {formatDate(endDate)}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">PIC</p>
            <p className="font-semibold text-slate-800">
              {picName ?? "-"}
              {picPhone ? ` (${picPhone})` : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
