import { ImageResponse } from "next/og"
import { getDashboardSnapshot } from "@/lib/dashboard-snapshot"

export const runtime = "nodejs"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "22px 26px",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      <div style={{ display: "flex", fontSize: 20, color: "#c7d6f5", fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", fontSize: 34, color: accent, fontWeight: 800, marginTop: 8 }}>{value}</div>
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
          padding: 48,
          background: "linear-gradient(135deg, #0a2540 0%, #09356b 55%, #041c38 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#ffffff" }}>SEVEN OS — Ringkasan Dashboard</div>
          <div style={{ display: "flex", fontSize: 18, color: "#9fb4dd", marginTop: 4 }}>
            <span>{tanggal}</span>
            <span style={{ margin: "0 8px" }}>·</span>
            <span>{jam} WIB</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 36 }}>
          <StatCard label="Piutang Outstanding" value={formatRupiah(snapshot.piutang.total)} accent="#fca5a5" />
          <StatCard label="Saldo Kas & Bank" value={formatRupiah(snapshot.totalSaldo)} accent="#86efac" />
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
          <StatCard label="Invoice Belum Lunas" value={`${snapshot.piutang.count} invoice`} accent="#fca5a5" />
          <StatCard
            label="Domain Perlu Perhatian"
            value={`${snapshot.domain.expiredCount + snapshot.domain.expiringCount} domain`}
            accent="#fcd34d"
          />
          <StatCard label="Biaya Berkala Jatuh Tempo" value={`${snapshot.biayaBerkala.dueCount} item`} accent="#fcd34d" />
        </div>

        {snapshot.piutang.top.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            <div style={{ display: "flex", fontSize: 18, color: "#c7d6f5", fontWeight: 700, marginBottom: 10 }}>Piutang Terbesar</div>
            {snapshot.piutang.top.slice(0, 4).map((r, i, arr) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 18,
                  color: "#e6ecfb",
                  padding: "6px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                }}
              >
                <span>{r.clientName}</span>
                <span style={{ fontWeight: 700 }}>{formatRupiah(r.remaining)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", fontSize: 16, color: "#7f96c4", marginTop: 28 }}>
          <span>Detail lengkap & aksi lanjut:</span>
          <span style={{ marginLeft: 6 }}>{process.env.APP_BASE_URL || "https://app.onyseven.com"}/dashboard</span>
        </div>
      </div>
    ),
    { width: 1200, height: 800 }
  )
}
