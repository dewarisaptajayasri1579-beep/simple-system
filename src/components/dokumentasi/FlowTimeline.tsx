import { Badge } from "@/components/ui";

export interface FlowStep {
  no: string;
  title: string;
  description: string;
  detail?: string[];
  refs?: string[];
}

/** Timeline vertikal buat dokumentasi alur — nomor bulat + garis penghubung, tiap step boleh
 *  ada bullet detail dan "chip" referensi kode (endpoint/file) biar bisa langsung dicari di
 *  editor kalau butuh verifikasi. Presentational murni, tidak fetch data apa pun. */
export const FlowTimeline: React.FC<{ steps: FlowStep[]; accent?: "blue" | "slate" }> = ({ steps, accent = "blue" }) => {
  const dotClass = accent === "blue" ? "bg-[#0544cc] text-white" : "bg-slate-500 text-white";

  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={step.no} className="flex gap-4">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black ${dotClass}`}>{step.no}</div>
            {i < steps.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
          </div>
          <div className={`pb-8 flex-1 min-w-0 ${i === steps.length - 1 ? "pb-0" : ""}`}>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">{step.title}</h3>
            <p className="text-sm text-slate-600 mt-1">{step.description}</p>
            {step.detail && step.detail.length > 0 && (
              <ul className="mt-2 space-y-1 list-disc list-inside">
                {step.detail.map((d, j) => (
                  <li key={j} className="text-xs sm:text-sm text-slate-600">
                    {d}
                  </li>
                ))}
              </ul>
            )}
            {step.refs && step.refs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {step.refs.map((r) => (
                  <Badge key={r} variant="secondary" size="sm">
                    <code className="font-mono">{r}</code>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
