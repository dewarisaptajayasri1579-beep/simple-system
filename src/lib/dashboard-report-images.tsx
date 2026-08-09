import { ImageResponse } from "next/og"
import { getDashboardSnapshot, type DashboardSnapshot } from "@/lib/dashboard-snapshot"
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

/** Dipakai bareng oleh route /api/reports/dashboard-image(-2) (untuk preview manual di browser)
 *  dan runDashboardReport() (untuk pre-render jadi file statis sebelum dikasih ke WAHUB — lihat
 *  cron/dashboard-report.ts untuk alasannya: WAHUB fetch mediaUrl-nya sendiri, jadi kalau URL-nya
 *  masih route on-demand yang render 15-20 detik, socket WA keburu bermasalah sebelum selesai). */
export function renderDashboardImage1(snapshot: DashboardSnapshot, now: Date) {
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.onyseven.com"
  const piutangRows = snapshot.piutang.top.slice(0, 4)
  const serverRows = snapshot.server.due.slice(0, 4)

  return new ImageResponse(
    (
      <PageShell>
        <ReportHeader title="SEVEN OS" subtitle="Ringkasan Dashboard" now={now} />

        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          <div style={{ display: "flex", gap: 34 }}>
            <StatCard icon="dollarSign" iconBg={COLORS.rose} label="Piutang Outstanding" value={formatRupiah(snapshot.piutang.total)} valueColor="#e11d48" />
            <StatCard icon="landmark" iconBg={COLORS.emerald} label="Saldo Kas & Bank" value={formatRupiah(snapshot.totalSaldo)} valueColor="#059669" />
          </div>
          <div style={{ display: "flex", gap: 34 }}>
            <StatCard icon="fileText" iconBg={COLORS.sky} label="Invoice Belum Lunas" value={`${snapshot.piutang.count}`} valueColor="#0284c7" chevron />
            <StatCard
              icon="globe"
              iconBg={COLORS.amber}
              label="Domain Perlu Perhatian"
              value={`${snapshot.domain.expiredCount + snapshot.domain.expiringCount}`}
              valueColor="#b45309"
              chevron
            />
          </div>
          <div style={{ display: "flex", gap: 34 }}>
            <StatCard
              icon="clock"
              iconBg={COLORS.violet}
              label="Biaya Berkala Jatuh Tempo"
              value={`${snapshot.biayaBerkala.dueCount}`}
              valueColor="#7c3aed"
              chevron
            />
            <StatCard
              icon="server"
              iconBg={COLORS.cyan}
              label="Server Belum Dibayar"
              value={`${snapshot.server.expiredCount + snapshot.server.expiringCount}`}
              valueColor="#0e7490"
              chevron
            />
          </div>
          <div style={{ display: "flex", gap: 34 }}>
            <StatCard
              icon="shieldCheck"
              iconBg={COLORS.rose}
              label="Tagihan Lewat SLA"
              value={`${snapshot.billingSla.overdueCount}`}
              valueColor="#e11d48"
              chevron
            />
          </div>
        </div>

        {piutangRows.length > 0 && (
          <SectionCard title="Piutang Terbesar">
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {piutangRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.clientName} valueRight={formatRupiah(r.remaining)} valueColor="#e11d48" />
              ))}
            </div>
          </SectionCard>
        )}

        {serverRows.length > 0 && (
          <SectionCard title="Server Belum Dibayar" badge={snapshot.server.expiredCount + snapshot.server.expiringCount}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {serverRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.name} valueRight={formatRupiah(r.price)} valueColor="#0e7490">
                  <RowCardDetail>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>{r.clientName}</span>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>·</span>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.heading }}>{formatTanggalSingkat(r.dueDate)}</span>
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

export function renderDashboardImage2(snapshot: DashboardSnapshot, now: Date) {
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.onyseven.com"
  const domainRows = snapshot.domain.due.slice(0, 6)
  const billRows = snapshot.biayaBerkala.due.slice(0, 6)
  const slaRows = snapshot.billingSla.overdue

  return new ImageResponse(
    (
      <PageShell>
        <ReportHeader title="SEVEN OS" subtitle="Domain & Biaya Berkala" now={now} />

        {slaRows.length > 0 && (
          <SectionCard title="Tagihan Lewat SLA" badge={snapshot.billingSla.overdueCount}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {slaRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.name} valueRight={`lewat ${r.daysOverdue} hari`} valueColor="#e11d48">
                  <RowCardDetail>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>{r.clientName}</span>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>·</span>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.heading }}>{r.stage}</span>
                  </RowCardDetail>
                </RowCard>
              ))}
            </div>
          </SectionCard>
        )}

        {domainRows.length > 0 && (
          <SectionCard title="Domain Perlu Perhatian" badge={snapshot.domain.expiredCount + snapshot.domain.expiringCount}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {domainRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.name} valueRight={formatRupiah(r.price)} valueColor="#b45309">
                  <RowCardDetail>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>{r.clientName}</span>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.textDim }}>·</span>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.heading }}>{formatTanggalSingkat(r.dueDate)}</span>
                    <StatusPill overdue={r.overdue} />
                  </RowCardDetail>
                </RowCard>
              ))}
            </div>
          </SectionCard>
        )}

        {billRows.length > 0 && (
          <SectionCard title="Biaya Berkala Jatuh Tempo" badge={snapshot.biayaBerkala.dueCount}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {billRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.name} valueRight={formatRupiah(r.price)} valueColor="#7c3aed">
                  <RowCardDetail>
                    <span style={{ display: "flex", fontSize: 46, color: COLORS.heading }}>{formatTanggalSingkat(r.dueDate)}</span>
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
    { width: 2160, height: 5450 }
  )
}

export { getDashboardSnapshot }
