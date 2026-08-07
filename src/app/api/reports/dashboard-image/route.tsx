import { ImageResponse } from "next/og"
import { getDashboardSnapshot } from "@/lib/dashboard-snapshot"
import {
  COLORS,
  PageShell,
  ReportHeader,
  ReportFooter,
  StatCard,
  SectionCard,
  RowCard,
  RowCardDetail,
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
        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          <div style={{ display: "flex", gap: 34 }}>
            <StatCard icon="dollarSign" iconBg={COLORS.rose} label="Piutang Outstanding" value={formatRupiah(snapshot.piutang.total)} valueColor="#fca5a5" />
            <StatCard icon="landmark" iconBg={COLORS.emerald} label="Saldo Kas & Bank" value={formatRupiah(snapshot.totalSaldo)} valueColor="#6ee7b7" />
          </div>
          <div style={{ display: "flex", gap: 34 }}>
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
          <div style={{ display: "flex", gap: 34 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {piutangRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.clientName} valueRight={formatRupiah(r.remaining)} valueColor="#fca5a5" />
              ))}
            </div>
          </SectionCard>
        )}

        {/* Server Belum Dibayar */}
        {serverRows.length > 0 && (
          <SectionCard title="Server Belum Dibayar" badge={snapshot.server.expiredCount + snapshot.server.expiringCount}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {serverRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.name}>
                  <RowCardDetail>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>{r.clientName}</span>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>·</span>
                    <span style={{ display: "flex", fontSize: 46, color: "#e6ecfb" }}>{formatTanggalSingkat(r.dueDate)}</span>
                    <StatusPill overdue={r.overdue} />
                  </RowCardDetail>
                </RowCard>
              ))}
            </div>
          </SectionCard>
        )}

        <ReportFooter appBaseUrl={appBaseUrl} />
      </PageShell>
    ),
    { width: 2160, height: 4300 }
  )
}
