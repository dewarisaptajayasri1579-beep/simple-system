import { readFileSync } from "fs"
import { join } from "path"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { terbilangRupiah } from "@/lib/terbilang"
import type { Payment, InvoicePayment, Invoice, Client, Account } from "@prisma/client"

const BLUE = "#0544cc"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function logoDataUri() {
  const buf = readFileSync(join(process.cwd(), "public/nota/logo-7smarts.png"))
  return `data:image/png;base64,${buf.toString("base64")}`
}

const styles = StyleSheet.create({
  page: { padding: 20, fontFamily: "Helvetica", fontSize: 9, color: "#1e293b" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 90, height: 30 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 26, color: "#0f172a" },
  qrBadge: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: BLUE },
  badgeWrap: { flexDirection: "row", alignSelf: "flex-end", marginTop: 8 },
  badgeCol: { paddingHorizontal: 10 },
  badgeDivider: { width: 1, backgroundColor: "#e2e8f0" },
  badgeLabel: { fontSize: 7, color: "#64748b", marginBottom: 2 },
  badgeValue: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#0f172a" },
  infoBox: { marginTop: 14, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  infoRowLast: { borderBottomWidth: 0 },
  iconCircle: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#eff4fe", marginRight: 8 },
  infoLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#64748b", width: 100 },
  infoValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#0f172a", flex: 1 },
  infoValueItalic: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BLUE, flex: 1 },
  amountBar: { marginTop: 12, borderRadius: 8, backgroundColor: BLUE, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  amountLabel: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 10, textTransform: "uppercase" },
  amountValue: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 18 },
  bottomRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  bottomCol: { flex: 1, flexDirection: "row", alignItems: "center" },
  bottomLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: BLUE, textTransform: "uppercase" },
  bottomValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#0f172a", marginTop: 2 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  footerText: { fontSize: 8, color: "#64748b" },
})

/** Kwitansi PDF asli (bukan gambar) — dirender server-side via @react-pdf/renderer, meniru
 *  layout KwitansiPrintable.tsx ("Kwitansi Keren") supaya link yang dikirim lewat WA bentuknya
 *  sama dengan yang dicetak staf dari halaman detail Pembayaran. */
export function KwitansiPdfDocument({
  payment,
  qrDataUrl,
}: {
  payment: Payment & { client: Client; account: Account; invoicePayments: (InvoicePayment & { invoice: Invoice })[] }
  qrDataUrl?: string
}) {
  const logo = logoDataUri()
  const untukPembayaran = payment.invoicePayments.map((ip) => ip.invoice.invoiceNumber).join(", ")

  return (
    <Document>
      <Page size="A5" orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          <Image src={logo} style={styles.logo} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>KWITANSI</Text>
            {qrDataUrl && <Image src={qrDataUrl} style={styles.qrBadge} />}
          </View>
        </View>

        <View style={styles.badgeWrap}>
          <View style={styles.badgeCol}>
            <Text style={styles.badgeLabel}>No. Kwitansi</Text>
            <Text style={styles.badgeValue}>{payment.paymentNumber}</Text>
          </View>
          <View style={styles.badgeDivider} />
          <View style={styles.badgeCol}>
            <Text style={styles.badgeLabel}>Date</Text>
            <Text style={styles.badgeValue}>{formatDate(payment.paidAt)}</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sudah terima dari</Text>
            <Text style={styles.infoValue}>{payment.client.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Uang sejumlah</Text>
            <Text style={styles.infoValueItalic}>{terbilangRupiah(payment.totalAmount)}</Text>
          </View>
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Untuk pembayaran</Text>
            <Text style={styles.infoValue}>Pelunasan invoice {untukPembayaran}</Text>
          </View>
        </View>

        <View style={styles.amountBar}>
          <Text style={styles.amountLabel}>Jumlah</Text>
          <Text style={styles.amountValue}>{formatRupiah(payment.totalAmount)}</Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.bottomCol}>
            <View>
              <Text style={styles.bottomLabel}>Metode Pembayaran</Text>
              <Text style={styles.bottomValue}>{payment.account.name}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Terima kasih atas kepercayaan dan kerja samanya.</Text>
        </View>
      </Page>
    </Document>
  )
}
