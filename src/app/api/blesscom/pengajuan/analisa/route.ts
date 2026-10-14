import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { continueLevelChat, type LevelChatTurn } from "@/lib/work-price/ai-level"

/**
 * Obrolan penentuan kategori + level untuk pekerjaan Blesscom. Beda dari
 * /api/kalkulator-harga/analisa: di sini TIDAK ada penilaian bobot sama sekali — harga diambil
 * langsung dari harga level yang dipilih.
 */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as
    | { history?: LevelChatTurn[]; maxQuestions?: number; forceConclude?: boolean }
    | null
  const history = body?.history
  if (!history || history.length === 0) return NextResponse.json({ error: "Deskripsi pekerjaan wajib diisi" }, { status: 400 })

  // Hanya level yang ada di daftar harga Blesscom, dan harganya pakai harga Blesscom — bukan
  // `price` yang merupakan turunan rubrik bobot. Daftar ini dikelola di
  // Acuan Level -> tab "Level Harga Blesscom".
  const rows = await prisma.workPriceItem.findMany({
    where: { active: true, blesscomPrice: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, groupName: true, level: true, label: true, description: true, blesscomPrice: true },
  })
  const catalog = rows.map((r) => ({
    id: r.id,
    groupName: r.groupName,
    level: r.level,
    label: r.label,
    description: r.description,
    price: r.blesscomPrice as number,
  }))

  const questionsAsked = history.filter((h) => h.role === "assistant").length

  try {
    const result = await continueLevelChat(history, catalog, questionsAsked, {
      // Dipatok di server supaya obrolan tak terbatas tidak bisa dipicu dari browser.
      maxQuestions: Math.min(15, Math.max(1, Math.round(body?.maxQuestions ?? 5))),
      forceConclude: body?.forceConclude === true,
    })

    if (result.status === "tanya") return NextResponse.json(result)

    // Lengkapi tiap item dengan kategori, level, dan harganya supaya browser tidak perlu
    // mencocokkan sendiri ke katalog.
    const byId = new Map(catalog.map((c) => [c.id, c]))
    const items = result.items
      .map((it) => {
        const ref = byId.get(it.itemId)
        if (!ref) return null
        return {
          itemId: ref.id,
          groupName: ref.groupName,
          level: ref.level,
          label: ref.label,
          qty: it.qty,
          unitPrice: ref.price,
          subtotal: ref.price * it.qty,
          alasan: it.alasan,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    return NextResponse.json({
      status: "selesai",
      ringkasan: result.ringkasan,
      items,
      total: items.reduce((sum, it) => sum + it.subtotal, 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menganalisa"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
