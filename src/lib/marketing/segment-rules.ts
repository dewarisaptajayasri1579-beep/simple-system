import { prisma } from "@/lib/prisma"

/** Normalisasi input keyword dari UI (dipisah koma / baris baru) jadi array rapi & unik. */
export function parseKeywordInput(v: unknown): string[] {
  const arr = typeof v === "string" ? v.split(/[,\n]/) : Array.isArray(v) ? v.map((x) => String(x)) : []
  return [...new Set(arr.map((k) => k.trim()).filter(Boolean))]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Cocokkan teks (biasanya isi pesan masuk pertama) ke daftar keyword tiap segmen aktif.
 * Match = whole-word / whole-phrase, case-insensitive (batas: karakter non-huruf & non-angka,
 * mendukung unicode dasar). Segmen dengan `keywordPriority` tertinggi menang; seri → paling lama
 * dibuat. Return segmen yang cocok atau null.
 */
export async function matchSegmentByKeywords(text: string | null | undefined): Promise<{ id: string; code: string } | null> {
  const haystack = (text ?? "").toLowerCase()
  if (!haystack.trim()) return null

  const segments = await prisma.segment.findMany({
    where: { isActive: true, keywords: { isEmpty: false } },
    select: { id: true, code: true, keywords: true },
    orderBy: [{ keywordPriority: "desc" }, { createdAt: "asc" }],
  })

  for (const seg of segments) {
    for (const raw of seg.keywords) {
      const kw = raw.trim().toLowerCase()
      if (!kw) continue
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(kw)}(?:$|[^\\p{L}\\p{N}])`, "u")
      if (re.test(haystack)) return { id: seg.id, code: seg.code }
    }
  }
  return null
}

/**
 * Kalau `leadId` belum bersegmen dan `text` cocok ke keyword suatu segmen, set segmen itu +
 * catat `LeadSegmentHistory` (source RULE). Return segmentId yang di-apply, atau null.
 * Aman dipanggil untuk lead baru maupun lead lama tanpa segmen — lead yang sudah bersegmen
 * tidak pernah ditimpa.
 */
export async function applyKeywordSegmentation(leadId: string, text: string | null | undefined): Promise<string | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { segmentId: true } })
  if (!lead || lead.segmentId) return null

  const matched = await matchSegmentByKeywords(text)
  if (!matched) return null

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { segmentId: matched.id } }),
    prisma.leadSegmentHistory.create({
      data: {
        leadId,
        toSegmentId: matched.id,
        source: "RULE",
        reason: `Keyword pesan awal: "${(text ?? "").slice(0, 160)}"`,
      },
    }),
  ])
  return matched.id
}
