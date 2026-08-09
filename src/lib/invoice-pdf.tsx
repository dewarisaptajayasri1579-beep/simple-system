import { readFileSync } from "fs"
import { join } from "path"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { terbilangRupiah } from "@/lib/terbilang"
import type { Invoice, InvoiceLine, Client } from "@prisma/client"

const BLUE = "#0544cc"

const COMPANY = {
  addressLine1: "Kp. Bhayangkara RT 04/15,",
  addressLine2: "Siswodipuran, Boyolali, Jawa Tengah",
  phone: "087739255404",
  email: "7smarts.id@gmail.com",
}

function formatDate(date: Date | null) {
  if (!date) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

// next/og pakai file di public/ lewat fetch, tapi @react-pdf/renderer jalan murni di Node —
// baca langsung dari disk & embed base64 supaya render PDF-nya tidak bergantung jaringan.
function logoDataUri() {
  const buf = readFileSync(join(process.cwd(), "public/nota/logo-7smarts.png"))
  return `data:image/png;base64,${buf.toString("base64")}`
}

const styles = StyleSheet.create({
  page: { padding: 20, fontFamily: "Helvetica", fontSize: 9, color: "#1e293b" },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 90, height: 30 },
  invoiceTitle: { fontFamily: "Helvetica-Bold", fontSize: 26, color: "#0f172a" },
  badgeWrap: { flexDirection: "row", alignSelf: "flex-end", marginTop: 8 },
  badgeCol: { paddingHorizontal: 10 },
  badgeDivider: { width: 1, backgroundColor: "#e2e8f0" },
  badgeLabel: { fontSize: 7, color: "#64748b", marginBottom: 2 },
  badgeValue: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#0f172a" },
  infoRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  infoCard: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8 },
  customerCard: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, backgroundColor: "#eff4fe" },
  infoLine: { flexDirection: "row", marginBottom: 3 },
  infoLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: BLUE, textTransform: "uppercase", marginBottom: 2 },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#0f172a" },
  table: { marginTop: 10, borderRadius: 6, overflow: "hidden" },
  tableHeader: { flexDirection: "row", backgroundColor: "#0f172a", paddingVertical: 6 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 6 },
  thNo: { width: 24, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "center" },
  thNama: { flex: 1, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "left", paddingLeft: 6 },
  thQty: { width: 40, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "center" },
  thHarga: { width: 70, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "center" },
  thTotal: { width: 70, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "center" },
  tdNo: { width: 24, fontSize: 8, color: "#94a3b8", textAlign: "center" },
  tdNama: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1e293b", paddingLeft: 6 },
  tdQty: { width: 40, fontSize: 8, textAlign: "center" },
  tdHarga: { width: 70, fontSize: 8, textAlign: "center" },
  tdTotal: { width: 70, fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "center" },
  bottomRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  paymentCard: { flex: 1, flexDirection: "row", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8 },
  paymentCol: { flex: 1, flexDirection: "row", alignItems: "center", padding: 8, gap: 6 },
  paymentDivider: { width: 1, backgroundColor: "#e2e8f0" },
  iconCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#eff4fe", alignItems: "center", justifyContent: "center" },
  totalsCol: { flex: 1, flexDirection: "column", gap: 4 },
  subtotalRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#f8fafc", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, fontSize: 8, fontFamily: "Helvetica-Bold" },
  grandTotalRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: BLUE, borderRadius: 6, paddingHorizontal: 12 },
  grandTotalLabel: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 9, textTransform: "uppercase" },
  grandTotalValue: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 14 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  footerText: { fontSize: 8, color: "#64748b" },
})

export interface InvoicePdfBank {
  name: string | null
  account: string | null
  number: string | null
}

/** Nota/Invoice PDF asli (bukan gambar) — dirender server-side via @react-pdf/renderer, meniru
 *  layout NotaPrintable.tsx ("Nota Keren") supaya link yang dikirim lewat WA bentuknya sama
 *  dengan yang dicetak staf dari halaman detail invoice. */
export function InvoicePdfDocument({
  invoice,
  bank,
}: {
  invoice: Invoice & { client: Client; lines: InvoiceLine[] }
  bank: InvoicePdfBank
}) {
  const logo = logoDataUri()

  return (
    <Document>
      <Page size="A5" orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          <Image src={logo} style={styles.logo} />
          <Text style={styles.invoiceTitle}>INVOICE</Text>
        </View>

        <View style={styles.badgeWrap}>
          <View style={styles.badgeCol}>
            <Text style={styles.badgeLabel}>Invoice No</Text>
            <Text style={styles.badgeValue}>{invoice.invoiceNumber}</Text>
          </View>
          <View style={styles.badgeDivider} />
          <View style={styles.badgeCol}>
            <Text style={styles.badgeLabel}>Date</Text>
            <Text style={styles.badgeValue}>{formatDate(invoice.issuedAt)}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoCard}>
            <View style={styles.infoLine}>
              <Text>{COMPANY.addressLine1}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text>{COMPANY.addressLine2}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text>{COMPANY.phone}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text>{COMPANY.email}</Text>
            </View>
          </View>

          <View style={styles.customerCard}>
            <Text style={styles.infoLabel}>Customer</Text>
            <Text style={styles.companyName}>{invoice.client.name}</Text>
            {(invoice.client.address || invoice.client.city) && (
              <View style={[styles.infoLine, { marginTop: 3 }]}>
                <Text>{invoice.client.address || invoice.client.city}</Text>
              </View>
            )}
            {invoice.client.phoneNumber && (
              <View style={styles.infoLine}>
                <Text>{invoice.client.phoneNumber}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.thNo}>No</Text>
            <Text style={styles.thNama}>Nama</Text>
            <Text style={styles.thQty}>Qty</Text>
            <Text style={styles.thHarga}>Harga</Text>
            <Text style={styles.thTotal}>Total</Text>
          </View>
          {invoice.lines.map((line, i) => (
            <View key={line.id} style={styles.tableRow}>
              <Text style={styles.tdNo}>{i + 1}</Text>
              <Text style={styles.tdNama}>{line.description}</Text>
              <Text style={styles.tdQty}>{line.qty}</Text>
              <Text style={styles.tdHarga}>{formatRupiah(line.unitPrice)}</Text>
              <Text style={styles.tdTotal}>{formatRupiah(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.paymentCard}>
            {bank.name && (
              <View style={styles.paymentCol}>
                <View style={styles.iconCircle} />
                <View>
                  <Text style={styles.infoLabel}>Payment To</Text>
                  <Text style={styles.companyName}>{bank.name}</Text>
                  {bank.account && <Text style={{ fontSize: 7 }}>{bank.account}</Text>}
                  {bank.number && <Text style={{ fontSize: 7 }}>{bank.number}</Text>}
                </View>
              </View>
            )}
            <View style={styles.paymentDivider} />
            <View style={styles.paymentCol}>
              <View style={styles.iconCircle} />
              <View>
                <Text style={styles.infoLabel}>Terbilang</Text>
                <Text style={{ fontSize: 7 }}>{terbilangRupiah(invoice.totalAmount)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.totalsCol}>
            <View style={styles.subtotalRow}>
              <Text>Subtotal</Text>
              <Text>{formatRupiah(invoice.subtotal)}</Text>
            </View>
            {invoice.discountAmount > 0 && (
              <View style={styles.subtotalRow}>
                <Text>Potongan</Text>
                <Text>- {formatRupiah(invoice.discountAmount)}</Text>
              </View>
            )}
            {invoice.ppnEnabled && (
              <View style={styles.subtotalRow}>
                <Text>PPN {invoice.ppnRate}%</Text>
                <Text>{formatRupiah(invoice.ppnAmount)}</Text>
              </View>
            )}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>{formatRupiah(invoice.totalAmount)}</Text>
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
