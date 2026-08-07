import { ImageResponse } from "next/og"
import { getDashboardSnapshot } from "@/lib/dashboard-snapshot"
import { COLORS, PageShell, ReportHeader, ReportFooter, SectionCard, RowCard, RowCardDetail, StatusPill, formatRupiah, formatTanggalSingkat } from "@/lib/report-image-ui"

export const runtime = "nodejs"

export async function GET() {
  const snapshot = await getDashboardSnapshot()
  const now = new Date()
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.onyseven.com"

  const domainRows = snapshot.domain.due.slice(0, 6)
  const billRows = snapshot.biayaBerkala.due.slice(0, 6)

  return new ImageResponse(
    (
      <PageShell>
        <ReportHeader title="SEVEN OS" subtitle="Domain & Biaya Berkala" now={now} />

        {/* Domain Perlu Perhatian */}
        {domainRows.length > 0 && (
          <SectionCard title="Domain Perlu Perhatian" badge={snapshot.domain.expiredCount + snapshot.domain.expiringCount}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {domainRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.name} valueRight={formatRupiah(r.price)} valueColor="#fcd34d">
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

        {/* Biaya Berkala Jatuh Tempo */}
        {billRows.length > 0 && (
          <SectionCard title="Biaya Berkala Jatuh Tempo" badge={snapshot.biayaBerkala.dueCount}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {billRows.map((r, i) => (
                <RowCard key={i} index={i + 1} title={r.name} valueRight={formatRupiah(r.price)} valueColor="#c4b5fd">
                  <RowCardDetail>
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
    { width: 2160, height: 5450 }
  )
}
