"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** Tombol test manual — kirim 2 gambar laporan dashboard (sama persis dengan yang otomatis
 *  jam 07:00/16:00 WIB) + caption berisi link dashboard, ke grup WA yang di-set di WAHUB_GROUP_JID. */
export const SendWhatsappReportButton: React.FC = () => {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleClick = async () => {
    setStatus("sending");
    setErrorMessage("");
    try {
      const res = await fetch("/api/reports/send", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal mengirim laporan ke WA");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Gagal mengirim laporan ke WA");
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={status === "sending"}>
        {status === "sending" ? "Mengirim..." : "Send WhatsApp"}
      </Button>
      {status === "success" && <span className="text-xs font-semibold text-emerald-600">Terkirim ke grup WA ✓</span>}
      {status === "error" && <span className="text-xs font-semibold text-rose-600">{errorMessage}</span>}
    </div>
  );
};
