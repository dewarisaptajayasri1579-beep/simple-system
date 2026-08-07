import { ImageResponse } from "next/og"
import { getDashboardSnapshot } from "@/lib/dashboard-snapshot"
import { COLORS, PageShell, ReportHeader, ReportFooter, SectionCard, StatusPill, formatRupiah, formatTanggalSingkat } from "@/lib/report-image-ui"

export const runtime = "nodejs"

export async function GET() {
  const snapshot = await getDashboardSnapshot()
  const now = new Date()
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.onyseven.com"

  const domainRows = snapshot.domain.due.slice(0, 5)
  const billRows = snapshot.biayaBerkala.due.slice(0, 5)

  return new ImageResponse(
    (
      <PageShell>
        <ReportHeader title="SEVEN OS" subtitle="Domain & Biaya Berkala" now={now} />

        {/* Domain Perlu Perhatian */}
        {domainRows.length > 0 && (
          <SectionCard title="Domain Perlu Perhatian" badge={snapshot.domain.expiredCount + snapshot.domain.expiringCount}>
            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.panelBorder}`, paddingBottom: 18, marginBottom: 4 }}>
              <div style={{ display: "flex", width: 90, fontSize: 26, color: COLORS.textDim }}>No</div>
              <div style={{ display: "flex", flex: 1.3, fontSize: 26, color: COLORS.textDim }}>Domain</div>
              <div style={{ display: "flex", flex: 1.1, fontSize: 26, color: COLORS.textDim }}>Pemilik</div>
              <div style={{ display: "flex", flex: 1, fontSize: 26, color: COLORS.textDim }}>Estimasi Habis</div>
            </div>
            {domainRows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "22px 0",
                  borderBottom: i < domainRows.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none",
                }}
              >
                <div style={{ display: "flex", width: 90, fontSize: 32, color: COLORS.textDim }}>{i + 1}</div>
                <div style={{ display: "flex", flex: 1.3, fontSize: 32, color: "#e6ecfb" }}>{r.name}</div>
                <div style={{ display: "flex", flex: 1.1, fontSize: 32, color: "#e6ecfb" }}>{r.clientName}</div>
                <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 16 }}>
                  <span style={{ display: "flex", fontSize: 32, color: "#e6ecfb" }}>{formatTanggalSingkat(r.dueDate)}</span>
                  <StatusPill overdue={r.overdue} />
                </div>
              </div>
            ))}
          </SectionCard>
        )}

        {/* Biaya Berkala Jatuh Tempo */}
        {billRows.length > 0 && (
          <SectionCard title="Biaya Berkala Jatuh Tempo" badge={snapshot.biayaBerkala.dueCount}>
            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.panelBorder}`, paddingBottom: 18, marginBottom: 4 }}>
              <div style={{ display: "flex", width: 90, fontSize: 26, color: COLORS.textDim }}>No</div>
              <div style={{ display: "flex", flex: 1.4, fontSize: 26, color: COLORS.textDim }}>Nama</div>
              <div style={{ display: "flex", flex: 1, fontSize: 26, color: COLORS.textDim }}>Jatuh Tempo</div>
              <div style={{ display: "flex", fontSize: 26, color: COLORS.textDim }}>Nominal</div>
            </div>
            {billRows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "22px 0",
                  borderBottom: i < billRows.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none",
                }}
              >
                <div style={{ display: "flex", width: 90, fontSize: 32, color: COLORS.textDim }}>{i + 1}</div>
                <div style={{ display: "flex", flex: 1.4, fontSize: 32, color: "#e6ecfb" }}>{r.name}</div>
                <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 16 }}>
                  <span style={{ display: "flex", fontSize: 32, color: "#e6ecfb" }}>{formatTanggalSingkat(r.dueDate)}</span>
                  <StatusPill overdue={r.overdue} />
                </div>
                <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#c4b5fd" }}>{formatRupiah(r.price)}</div>
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
