const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"]

function threeDigits(n: number): string {
  const ratus = Math.floor(n / 100)
  const sisa = n % 100
  const puluh = Math.floor(sisa / 10)
  const satu = sisa % 10

  let words = ""
  if (ratus > 0) words += ratus === 1 ? "seratus " : `${SATUAN[ratus]} ratus `

  if (sisa >= 11 && sisa <= 19) {
    words += sisa === 10 ? "sepuluh " : sisa === 11 ? "sebelas " : `${SATUAN[sisa - 10]} belas `
  } else if (puluh > 0) {
    words += puluh === 1 ? "sepuluh " : `${SATUAN[puluh]} puluh `
    if (satu > 0) words += `${SATUAN[satu]} `
  } else if (satu > 0) {
    words += `${SATUAN[satu]} `
  }

  return words.trim()
}

/** Angka -> kata bahasa Indonesia, dipakai di baris "Terbilang" nota. Cuma menangani bilangan
 *  bulat non-negatif (nominal Rupiah tidak pernah desimal/negatif di sistem ini). */
export function terbilang(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return "nol"

  const groups: [number, string][] = [
    [1_000_000_000_000, "triliun"],
    [1_000_000_000, "miliar"],
    [1_000_000, "juta"],
    [1_000, "ribu"],
  ]

  let remaining = n
  let words = ""

  for (const [value, label] of groups) {
    const count = Math.floor(remaining / value)
    if (count > 0) {
      words += count === 1 && label === "ribu" ? "seribu " : `${threeDigits(count)} ${label} `
      remaining %= value
    }
  }

  if (remaining > 0) words += threeDigits(remaining)

  return words.trim().replace(/\s+/g, " ")
}

/** Terbilang buat nominal Rupiah lengkap, kapital tiap kata (mis. "Satu Juta Dua Ratus Ribu
 *  Rupiah") — persis gaya baris terbilang di nota lama. */
export function terbilangRupiah(amount: number): string {
  const words = terbilang(amount)
  const capitalized = words
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
  return `${capitalized} Rupiah`
}
