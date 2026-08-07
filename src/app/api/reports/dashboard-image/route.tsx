import { ImageResponse } from "next/og"
import { getDashboardSnapshot } from "@/lib/dashboard-snapshot"
import {
  COLORS,
  PageShell,
  ReportHeader,
  ReportFooter,
  StatCard,
  SectionCard,
  StatusPill,
  formatRupiah,
  formatTanggalSingkat,
} from "@/lib/report-image-ui"

export const runtime = "nodejs"

export async function GET() {
  const snapshot = await getDashboardSnapshot()
  const now = new Date()
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.onyseven.com"

  const piutangRows = snapshot.piutang.top.slice(0, 4)
  const serverRows = snapshot.server.due.slice(0, 4)

  return new ImageResponse(
    (
      <PageShell>
        <ReportHeader title="SEVEN OS" subtitle="Ringkasan Dashboard" now={now} />

        {/* Stat grid: 3 baris x 2 kolom */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", gap: 24 }}>
            <StatCard icon="dollarSign" iconBg={COLORS.rose} label="Piutang Outstanding" value={formatRupiah(snapshot.piutang.total)} valueColor="#fca5a5" />
            <StatCard icon="landmark" iconBg={COLORS.emerald} label="Saldo Kas & Bank" value={formatRupiah(snapshot.totalSaldo)} valueColor="#6ee7b7" />
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <StatCard icon="fileText" iconBg={COLORS.sky} label="Invoice Belum Lunas" value={`${snapshot.piutang.count}`} valueColor="#7dd3fc" chevron />
            <StatCard
              icon="globe"
              iconBg={COLORS.amber}
              label="Domain Perlu Perhatian"
              value={`${snapshot.domain.expiredCount + snapshot.domain.expiringCount}`}
              valueColor="#fcd34d"
              chevron
            />
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <StatCard
              icon="clock"
              iconBg={COLORS.violet}
              label="Biaya Berkala Jatuh Tempo"
              value={`${snapshot.biayaBerkala.dueCount}`}
              valueColor="#c4b5fd"
              chevron
            />
            <StatCard
              icon="server"
              iconBg={COLORS.cyan}
              label="Server Belum Dibayar"
              value={`${snapshot.server.expiredCount + snapshot.server.expiringCount}`}
              valueColor="#67e8f9"
              chevron
            />
          </div>
        </div>

        {/* Piutang Terbesar */}
        {piutangRows.length > 0 && (
          <SectionCard title="Piutang Terbesar">
            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.panelBorder}`, paddingBottom: 18, marginBottom: 4 }}>
              <div style={{ display: "flex", width: 90, fontSize: 26, color: COLORS.textDim }}>No</div>
              <div style={{ display: "flex", flex: 1, fontSize: 26, color: COLORS.textDim }}>Nama Pelanggan</div>
              <div style={{ display: "flex", fontSize: 26, color: COLORS.textDim }}>Total Piutang</div>
            </div>
            {piutangRows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "22px 0",
                  borderBottom: i < piutangRows.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none",
                }}
              >
                <div style={{ display: "flex", width: 90, fontSize: 34, color: COLORS.textDim }}>{i + 1}</div>
                <div style={{ display: "flex", flex: 1, fontSize: 36, color: "#e6ecfb" }}>{r.clientName}</div>
                <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#fca5a5" }}>{formatRupiah(r.remaining)}</div>
              </div>
            ))}
          </SectionCard>
        )}

        {/* Server Belum Dibayar */}
        {serverRows.length > 0 && (
          <SectionCard title="Server Belum Dibayar" badge={snapshot.server.expiredCount + snapshot.server.expiringCount}>
            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.panelBorder}`, paddingBottom: 18, marginBottom: 4 }}>
              <div style={{ display: "flex", width: 90, fontSize: 26, color: COLORS.textDim }}>No</div>
              <div style={{ display: "flex", flex: 1.4, fontSize: 26, color: COLORS.textDim }}>Server / Layanan</div>
              <div style={{ display: "flex", flex: 1.1, fontSize: 26, color: COLORS.textDim }}>Pelanggan</div>
              <div style={{ display: "flex", flex: 1, fontSize: 26, color: COLORS.textDim }}>Jatuh Tempo</div>
            </div>
            {serverRows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "22px 0",
                  borderBottom: i < serverRows.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none",
                }}
              >
                <div style={{ display: "flex", width: 90, fontSize: 32, color: COLORS.textDim }}>{i + 1}</div>
                <div style={{ display: "flex", flex: 1.4, fontSize: 32, color: "#e6ecfb" }}>{r.name}</div>
                <div style={{ display: "flex", flex: 1.1, fontSize: 32, color: "#e6ecfb" }}>{r.clientName}</div>
                <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 16 }}>
                  <span style={{ display: "flex", fontSize: 32, color: "#e6ecfb" }}>{formatTanggalSingkat(r.dueDate)}</span>
                  <StatusPill overdue={r.overdue} />
                </div>
              </div>
            ))}
          </SectionCard>
        )}

        <ReportFooter appBaseUrl={appBaseUrl} />
      </PageShell>
    ),
    { width: 2160, height: 2320 }
  )
}
