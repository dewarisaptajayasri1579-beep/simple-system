import { ImageResponse } from "next/og"
import { getDashboardSnapshot } from "@/lib/dashboard-snapshot"

export const runtime = "nodejs"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function StatRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,255,255,0.08)",
        borderRadius: 40,
        padding: "32px 48px",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      <div style={{ display: "flex", fontSize: 92, color: "#c7d6f5", fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", fontSize: 144, color: accent, fontWeight: 800, marginTop: 16 }}>{value}</div>
    </div>
  )
}

export async function GET() {
  const snapshot = await getDashboardSnapshot()
  const now = new Date()
  const tanggal = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(now)
  const jam = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(now)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 96,
          background: "linear-gradient(160deg, #0a2540 0%, #09356b 55%, #041c38 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 168, fontWeight: 800, color: "#ffffff", lineHeight: 1.15 }}>SEVEN OS</div>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 600, color: "#dbe6fb", marginTop: 8 }}>Ringkasan Dashboard</div>
          <div style={{ display: "flex", fontSize: 84, color: "#9fb4dd", marginTop: 28 }}>
            <span>{tanggal}</span>
            <span style={{ margin: "0 20px" }}>·</span>
            <span>{jam} WIB</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 48 }}>
          <StatRow label="Piutang Outstanding" value={formatRupiah(snapshot.piutang.total)} accent="#fca5a5" />
          <StatRow label="Saldo Kas & Bank" value={formatRupiah(snapshot.totalSaldo)} accent="#86efac" />
          <StatRow label="Invoice Belum Lunas" value={`${snapshot.piutang.count}`} accent="#fca5a5" />
          <StatRow label="Domain Perlu Perhatian" value={`${snapshot.domain.expiredCount + snapshot.domain.expiringCount}`} accent="#fcd34d" />
          <StatRow label="Biaya Berkala Jatuh Tempo" value={`${snapshot.biayaBerkala.dueCount}`} accent="#fcd34d" />
        </div>

        {snapshot.piutang.top.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
            <div style={{ display: "flex", fontSize: 96, color: "#c7d6f5", fontWeight: 700, marginBottom: 20 }}>Piutang Terbesar</div>
            {snapshot.piutang.top.slice(0, 3).map((r, i, arr) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 84,
                  color: "#e6ecfb",
                  padding: "18px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                }}
              >
                <span>{r.clientName}</span>
                <span style={{ fontWeight: 700 }}>{formatRupiah(r.remaining)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", fontSize: 72, color: "#7f96c4", marginTop: "auto", paddingTop: 32 }}>
          <span>Detail lengkap & aksi lanjut:</span>
          <span style={{ color: "#a9bde8", fontWeight: 600, marginTop: 12 }}>{process.env.APP_BASE_URL || "https://app.onyseven.com"}/dashboard</span>
        </div>
      </div>
    ),
    { width: 2160, height: 3840 }
  )
}
