function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function formatDate(iso: string | null) {
  if (!iso) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

/** Follow-up piutang: sudah ada invoice sungguhan, jadi sebut nomor & nominal sisa. */
export function piutangFollowUpMessage(input: {
  clientName: string
  invoiceNumber: string
  remaining: number
  dueDate: string | null
}) {
  return (
    `Halo, mengingatkan invoice ${input.invoiceNumber} atas nama ${input.clientName} sebesar ${formatRupiah(input.remaining)}` +
    `${input.dueDate ? ` (jatuh tempo ${formatDate(input.dueDate)})` : ""}. Mohon konfirmasi pembayarannya ya. Terima kasih 🙏`
  )
}

/** Follow-up piutang per client (bukan per invoice) — dipakai tombol Follow Up di sebelah
 *  data PIC, merangkum semua invoice belum lunas milik client itu jadi satu pesan. */
export function piutangGroupFollowUpMessage(input: { clientName: string; totalRemaining: number; invoiceCount: number }) {
  return (
    `Halo, mengingatkan tagihan atas nama ${input.clientName} — total ${input.invoiceCount} invoice belum lunas sebesar ${formatRupiah(input.totalRemaining)}. ` +
    `Mohon konfirmasi pembayarannya ya. Terima kasih 🙏`
  )
}

/** Follow-up perpanjangan domain — dikirim sebelum/tanpa invoice terbit, jadi cuma info umum. */
export function domainFollowUpMessage(input: { clientName: string; domainName: string; dueDate: string | null }) {
  return (
    `Halo, mau info kalau domain ${input.domainName} atas nama ${input.clientName} ` +
    `${input.dueDate ? `akan/sudah habis masa aktifnya pada ${formatDate(input.dueDate)}` : "sudah waktunya diperpanjang"}. ` +
    `Mohon konfirmasi untuk perpanjangannya ya. Terima kasih 🙏`
  )
}

/** Follow-up perpanjangan server/hosting — padanan domainFollowUpMessage. */
export function serverFollowUpMessage(input: { clientName: string; serverName: string; dueDate: string | null }) {
  return (
    `Halo, mau info kalau layanan server/hosting ${input.serverName} atas nama ${input.clientName} ` +
    `${input.dueDate ? `akan/sudah jatuh tempo pada ${formatDate(input.dueDate)}` : "sudah waktunya diperpanjang"}. ` +
    `Mohon konfirmasi untuk perpanjangannya ya. Terima kasih 🙏`
  )
}
