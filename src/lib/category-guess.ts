/** Kata-kata generik yang sering muncul di keterangan transaksi tapi tidak menunjukkan
 *  kategori spesifik apa pun — diabaikan supaya pencocokan fokus ke kata kunci yang khas
 *  (mis. "listrik", "internet") daripada kata umum seperti "bayar" atau "biaya". */
const STOPWORDS = new Set([
  "bayar", "pembayaran", "biaya", "beban", "untuk", "dari", "ke", "dan", "di", "buat",
  "tagihan", "bulan", "bulanan", "iuran", "invoice", "transfer", "terima", "penerimaan",
  "jual", "beli", "pembelian", "penjualan", "yang", "atas", "nama", "via", "ini", "itu",
  "januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september",
  "oktober", "november", "desember",
])

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

function significantTokens(name: string): string[] {
  const tokens = normalize(name).split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t))
  return tokens.length > 0 ? tokens : normalize(name).split(" ").filter(Boolean)
}

/** Cocokkan teks keterangan transaksi ke salah satu kategori yang sudah ada, berdasarkan
 *  kata kunci di nama kategori (mis. keterangan "bayar listrik kantor" -> kategori "Biaya
 *  Listrik" karena token "listrik" match). Tidak membuat kategori baru — kalau tidak ada
 *  yang cocok, kembalikan null supaya user pilih/tambah manual seperti biasa. */
export function guessCategoryId(
  description: string,
  options: { value: string; label: string }[]
): string | null {
  const desc = normalize(description)
  if (!desc || options.length === 0) return null

  let best: { value: string; score: number; specificity: number } | null = null
  for (const opt of options) {
    const tokens = significantTokens(opt.label)
    if (tokens.length === 0) continue
    const matched = tokens.filter((t) => desc.includes(t))
    if (matched.length === 0) continue
    const score = matched.length / tokens.length
    const specificity = tokens.join("").length
    if (
      !best ||
      score > best.score ||
      (score === best.score && specificity > best.specificity)
    ) {
      best = { value: opt.value, score, specificity }
    }
  }

  return best ? best.value : null
}
