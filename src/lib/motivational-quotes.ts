export const MOTIVATIONAL_QUOTES = [
  "Rezeki tidak akan pernah tertukar, yang penting terus ikhtiar.",
  "Piutang yang ditagih dengan sabar, lunas dengan berkah.",
  "Bisnis kecil yang dikelola rapi, tumbuh jadi bisnis besar.",
  "Konsisten sedikit-sedikit lebih baik daripada semangat sesaat.",
  "Setiap invoice yang lunas adalah hasil kerja keras yang terbayar.",
  "Kelola uang dengan jujur, usaha akan berkah dan panjang umur.",
  "Hari ini kerja keras, besok panen hasilnya.",
  "Disiplin catat keuangan hari ini, tenang di hari nanti.",
  "Client puas, bisnis lancar, rezeki pun mengalir.",
  "Jangan takut mulai kecil, takutlah kalau tidak pernah mulai.",
] as const

export function getRandomMotivationalQuote(): string {
  const index = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)
  return MOTIVATIONAL_QUOTES[index]
}
