// Komponen & helper JSX yang dipakai bareng oleh semua route gambar laporan (next/og / satori) —
// lihat src/app/api/reports/dashboard-image*/route.tsx.

export function formatRupiah(amount: number | null) {
  if (!amount) return "Rp0"
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

export function formatTanggalSingkat(iso: string | null) {
  if (!iso) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

export function formatTanggalPanjang(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date)
}

export function formatJam(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(date)
}

// ---------------------------------------------------------------------------
// Ikon — path SVG diambil langsung dari lucide-react (paket yang sama dipakai UI app-nya)
// supaya gayanya konsisten, dirender manual di sini karena next/og (satori) cuma bisa
// merender elemen SVG primitif, bukan komponen React icon library-nya langsung.
// ---------------------------------------------------------------------------
type IconPath = { d?: string; cx?: string; cy?: string; r?: string; x1?: string; y1?: string; x2?: string; y2?: string }
type IconDef = ["path" | "circle" | "line", IconPath][]

export const ICONS: Record<string, IconDef> = {
  dollarSign: [
    ["line", { x1: "12", y1: "2", x2: "12", y2: "22" }],
    ["path", { d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" }],
  ],
  landmark: [
    ["path", { d: "M10 18v-7" }],
    ["path", { d: "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z" }],
    ["path", { d: "M14 18v-7" }],
    ["path", { d: "M18 18v-7" }],
    ["path", { d: "M3 22h18" }],
    ["path", { d: "M6 18v-7" }],
  ],
  fileText: [
    ["path", { d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" }],
    ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
    ["path", { d: "M10 9H8" }],
    ["path", { d: "M16 13H8" }],
    ["path", { d: "M16 17H8" }],
  ],
  globe: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }],
    ["path", { d: "M2 12h20" }],
  ],
  clock: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 6v6l4 2" }],
  ],
  server: [
    ["path", { d: "M2 2h20v8H2z" }],
    ["path", { d: "M2 14h20v8H2z" }],
    ["line", { x1: "6", y1: "6", x2: "6.01", y2: "6" }],
    ["line", { x1: "6", y1: "18", x2: "6.01", y2: "18" }],
  ],
  shieldCheck: [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
    ],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
  info: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],
  rocket: [
    ["path", { d: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" }],
    ["path", { d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09" }],
    ["path", { d: "M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z" }],
    ["path", { d: "M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05" }],
  ],
  chevronRight: [["path", { d: "m9 18 6-6-6-6" }]],
  calendar: [
    ["path", { d: "M8 2v4" }],
    ["path", { d: "M16 2v4" }],
    ["path", { d: "M3 10h18" }],
    ["path", { d: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" }],
  ],
}

export function Icon({
  name,
  size = 32,
  color = "#fff",
  strokeWidth = 2,
}: {
  name: keyof typeof ICONS
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const parts = ICONS[name]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {parts.map(([tag, p], i) => {
        if (tag === "path") return <path key={i} d={p.d} />
        if (tag === "circle") return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
        if (tag === "line") return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />
        return null
      })}
    </svg>
  )
}

export const COLORS = {
  bg1: "#0a2540",
  bg2: "#09356b",
  bg3: "#041c38",
  card: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.12)",
  panel: "rgba(255,255,255,0.045)",
  panelBorder: "rgba(255,255,255,0.1)",
  textDim: "#7f96c4",
  textMid: "#9fb4dd",
  textLabel: "#c7d6f5",
  rose: "#f43f5e",
  emerald: "#10b981",
  sky: "#0ea5e9",
  amber: "#d97706",
  violet: "#8b5cf6",
  cyan: "#0891b2",
  blue: "#2563eb",
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 80,
        gap: 44,
        background: `linear-gradient(160deg, ${COLORS.bg1} 0%, ${COLORS.bg2} 55%, ${COLORS.bg3} 100%)`,
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </div>
  )
}

export function ReportHeader({ title, subtitle, now }: { title: string; subtitle: string; now: Date }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 126, fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 69, fontWeight: 600, color: "#dbe6fb", marginTop: 6 }}>{subtitle}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 30 }}>
          <Icon name="calendar" size={42} color={COLORS.textMid} />
          <span style={{ display: "flex", fontSize: 46, color: COLORS.textMid }}>{formatTanggalPanjang(now)}</span>
          <span style={{ display: "flex", fontSize: 46, color: COLORS.textMid, margin: "0 6px" }}>·</span>
          <Icon name="clock" size={40} color={COLORS.textMid} />
          <span style={{ display: "flex", fontSize: 46, color: COLORS.textMid }}>{formatJam(now)} WIB</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 32,
          padding: "26px 38px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 88,
            height: 88,
            borderRadius: 24,
            background: COLORS.blue,
          }}
        >
          <Icon name="shieldCheck" size={48} color="#fff" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ display: "flex", fontSize: 42, fontWeight: 800, color: "#fff" }}>SEVEN OS</span>
          <span style={{ display: "flex", fontSize: 30, color: COLORS.textMid, letterSpacing: 2 }}>CONTROL PANEL</span>
        </div>
      </div>
    </div>
  )
}

export function StatCard({
  icon,
  iconBg,
  label,
  value,
  valueColor,
  chevron,
}: {
  icon: keyof typeof ICONS
  iconBg: string
  label: string
  value: string
  valueColor: string
  chevron?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flex: 1,
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 34,
        padding: "38px 42px",
        gap: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 116,
          height: 116,
          borderRadius: 28,
          background: iconBg,
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={56} color="#fff" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", fontSize: 42, color: COLORS.textLabel }}>{label}</div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: valueColor, marginTop: 10 }}>{value}</div>
      </div>
      {chevron && <Icon name="chevronRight" size={44} color="#4b5f88" />}
    </div>
  )
}

export function SectionCard({
  title,
  badge,
  children,
}: {
  title: string
  badge?: number
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: COLORS.panel,
        border: `1px solid ${COLORS.panelBorder}`,
        borderRadius: 44,
        padding: "44px 50px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 800, color: "#ffffff" }}>{title}</div>
          {badge !== undefined && (
            <div
              style={{
                display: "flex",
                background: COLORS.rose,
                color: "#fff",
                fontSize: 50,
                fontWeight: 800,
                borderRadius: 999,
                padding: "10px 30px",
              }}
            >
              {badge}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(255,255,255,0.07)",
            borderRadius: 999,
            padding: "20px 36px",
          }}
        >
          <span style={{ display: "flex", fontSize: 40, color: COLORS.textLabel, fontWeight: 600 }}>Lihat Semua</span>
          <Icon name="chevronRight" size={36} color={COLORS.textLabel} />
        </div>
      </div>
      {children}
    </div>
  )
}

export function RowCard({
  index,
  title,
  valueRight,
  valueColor,
  children,
}: {
  index: number
  title: string
  valueRight?: string
  valueColor?: string
  children?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 36,
        padding: "44px 48px",
        gap: 26,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 26,
              background: "rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}
          >
            <span style={{ display: "flex", fontSize: 50, color: COLORS.textDim, fontWeight: 800 }}>{index}</span>
          </div>
          <div style={{ display: "flex", fontSize: 68, color: "#ffffff", fontWeight: 700 }}>{title}</div>
        </div>
        {valueRight && (
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: valueColor || "#ffffff", flexShrink: 0 }}>{valueRight}</div>
        )}
      </div>
      {children}
    </div>
  )
}

export function RowCardDetail({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 22, paddingLeft: 124, flexWrap: "wrap" }}>{children}</div>
}

export function ReportFooter({ appBaseUrl }: { appBaseUrl: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <Icon name="info" size={48} color={COLORS.textDim} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ display: "flex", fontSize: 40, color: COLORS.textDim }}>Detail lengkap & aksi lanjut:</span>
          <span style={{ display: "flex", fontSize: 42, color: "#a9bde8", fontWeight: 600, marginTop: 6 }}>{appBaseUrl}/dashboard</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          background: COLORS.blue,
          borderRadius: 28,
          padding: "32px 52px",
        }}
      >
        <Icon name="rocket" size={44} color="#fff" />
        <span style={{ display: "flex", fontSize: 46, fontWeight: 800, color: "#fff" }}>Kelola Sekarang</span>
      </div>
    </div>
  )
}

export function StatusPill({ overdue }: { overdue: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        fontSize: 46,
        fontWeight: 700,
        color: "#fff",
        background: overdue ? COLORS.rose : COLORS.amber,
        borderRadius: 999,
        padding: "12px 32px",
      }}
    >
      {overdue ? "Terlambat" : "Segera"}
    </span>
  )
}
