import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = "claude-sonnet-5"
/** Sonnet 5 menyalakan thinking secara default dan max_tokens membatasi thinking + jawaban
 *  sekaligus — dibuat longgar supaya JSON jawabannya tidak pernah terpotong. */
const MAX_TOKENS = 16000

export const MAX_QUESTIONS = 5

export type LevelCatalogItem = {
  id: string
  groupName: string
  level: string | null
  label: string
  description: string | null
  price: number
}

export type LevelMatchedItem = {
  itemId: string
  qty: number
  alasan: string
}

export type LevelChatTurn = { role: "user" | "assistant"; text: string }
export type LevelAnswerType = "radio" | "checkbox" | "text"

export type LevelChatResult =
  | { status: "tanya"; pertanyaan: string; tipeJawaban: LevelAnswerType; pilihan: string[] }
  | { status: "selesai"; items: LevelMatchedItem[]; ringkasan: string }

export type LevelChatOptions = {
  maxQuestions?: number
  forceConclude?: boolean
  modelOverride?: string
}

/**
 * Prompt Blesscom — SENGAJA tidak memuat rubrik 8 parameter. Untuk Blesscom acuannya murni
 * kategori + level: hasil akhir obrolan adalah "kategori apa, level berapa", bukan skor bobot.
 * Itu sebabnya file ini terpisah dari ai-match.ts, bukan mode tambahan di sana — mencampur
 * keduanya bikin model ikut-ikutan berpikir dalam bobot.
 */
const SYSTEM_PROMPT = `Kamu membantu staf software house Indonesia menentukan kategori dan level pekerjaan untuk request dari client Blesscom.

Acuannya MURNI kategori dan level. Tugasmu: dari obrolan dengan staf, tentukan pekerjaan ini masuk kategori apa dan level berapa — persis salah satu dari daftar yang diberikan.

Cara kerja:
1. Staf kasih deskripsi pekerjaan, biasanya belum cukup detail untuk memastikan levelnya.
2. Kalau belum yakin levelnya, ajukan SATU pertanyaan yang paling menentukan — yaitu yang membedakan satu level dari level di sebelahnya menurut keterangan tiap level.
3. SELALU sediakan pilihan jawaban supaya staf tinggal klik:
   - "radio" (pilih satu) untuk jawaban yang saling meniadakan — ini yang paling sering dipakai. Isi "pilihan" 2-5 jawaban dalam bahasa staf, dan sisipkan "Belum tahu / tentukan saja yang wajar" kalau masuk akal.
   - "checkbox" untuk pertanyaan "apa saja yang dibutuhkan".
   - "text" HANYA kalau benar-benar tidak bisa dibuat pilihan; kosongkan "pilihan".
   Staf tetap bisa mengetik jawabannya sendiri, jadi pilihan tidak harus mencakup semua kemungkinan.
4. Ada batas berapa kali kamu boleh bertanya; sistem memberitahu tiap giliran. Begitu mentok, WAJIB simpulkan dengan asumsi paling masuk akal. Jangan pakai jatah pertanyaan kalau sudah cukup jelas.
5. Saat menyimpulkan: pecah jadi beberapa item kalau deskripsi menyebut beberapa kebutuhan terpisah (mis. "master data supplier + laporan penjualan" = 2 item). Qty > 1 kalau pekerjaan yang sama berulang (mis. "5 master data").
6. "alasan" tiap item: 1 kalimat, kenapa level itu yang dipilih, merujuk ke keterangan level dan jawaban staf. JANGAN menyebut harga atau angka rupiah.
7. itemId WAJIB persis salah satu id dari daftar — jangan mengarang id.

Format jawaban WAJIB ikut skema JSON:
- status "tanya": isi "pertanyaan", "tipeJawaban", "pilihan"; kosongkan "items" (array kosong) dan "ringkasan" (string kosong).
- status "selesai": kosongkan "pertanyaan" dan "pilihan"; isi "items" dan "ringkasan".

"ringkasan" 1-2 kalimat: sebutkan kategori & level yang dipilih beserta alasan singkatnya. Bahasa Indonesia santai tapi profesional.`

function catalogText(catalog: LevelCatalogItem[]): string {
  return catalog
    .map((c) => `- [id:${c.id}] ${c.groupName}${c.level ? ` — ${c.level}` : ` — ${c.label}`}: ${c.description ?? "(tanpa keterangan)"}`)
    .join("\n")
}

function buildOutputSchema(validIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["status", "pertanyaan", "tipeJawaban", "pilihan", "items", "ringkasan"],
    properties: {
      status: { type: "string", enum: ["tanya", "selesai"] },
      pertanyaan: { type: "string", description: "Satu pertanyaan klarifikasi. Kosong kalau status 'selesai'." },
      tipeJawaban: { type: "string", enum: ["radio", "checkbox", "text"] },
      pilihan: { type: "array", items: { type: "string" }, description: "Pilihan jawaban dalam bahasa staf." },
      items: {
        type: "array",
        description: "Kategori+level yang dipilih. Kosongkan kalau status 'tanya'.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["itemId", "qty", "alasan"],
          properties: {
            itemId: { type: "string", enum: validIds },
            qty: { type: "integer", description: "Jumlah unit pekerjaan ini, minimal 1." },
            alasan: { type: "string" },
          },
        },
      },
      ringkasan: { type: "string" },
    },
  } as const
}

export async function continueLevelChat(
  history: LevelChatTurn[],
  catalog: LevelCatalogItem[],
  questionsAsked: number,
  options: LevelChatOptions = {}
): Promise<LevelChatResult> {
  const { maxQuestions, forceConclude = false, modelOverride } = options
  const limit = Math.max(1, maxQuestions ?? MAX_QUESTIONS)
  if (catalog.length === 0) throw new Error("Daftar kategori/level belum ada datanya")
  if (history.length === 0) throw new Error("Deskripsi pekerjaan wajib diisi")

  const statusNote = forceConclude
    ? 'Staf minta kamu langsung menyimpulkan sekarang. WAJIB kembalikan status "selesai" — pakai asumsi paling masuk akal untuk yang belum jelas.'
    : questionsAsked >= limit
      ? `Kamu sudah bertanya ${questionsAsked}/${limit} kali. WAJIB kembalikan status "selesai" sekarang.`
      : `Kamu sudah bertanya ${questionsAsked}/${limit} kali di obrolan ini.`

  const response = await anthropic.messages.create({
    model: modelOverride ?? MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `DAFTAR KATEGORI & LEVEL:\n${catalogText(catalog)}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: statusNote },
    ],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildOutputSchema(catalog.map((c) => c.id)) as unknown as Record<string, unknown> },
    },
    messages: history.map((h) => ({ role: h.role, content: h.text })),
  })

  if (response.stop_reason === "refusal") throw new Error("Analisa ditolak oleh filter keamanan model")
  if (response.stop_reason === "max_tokens") {
    throw new Error("Jawaban AI kepanjangan dan terpotong. Coba pecah pekerjaannya jadi beberapa bagian, atau ulangi.")
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
  if (!text.trim()) throw new Error("Model tidak mengembalikan hasil analisa")

  const parsed = JSON.parse(text) as {
    status: "tanya" | "selesai"
    pertanyaan: string
    tipeJawaban: LevelAnswerType
    pilihan: string[]
    items: LevelMatchedItem[]
    ringkasan: string
  }

  // Jaring pengaman: kalau model tetap bertanya padahal sudah mentok, paksa selesai supaya staf
  // tidak kejebak obrolan tanpa akhir.
  if (parsed.status === "tanya" && (forceConclude || questionsAsked >= limit)) {
    return { status: "selesai", items: [], ringkasan: "Belum cukup yakin menentukan levelnya dari jawaban yang ada — perlu dicek manual." }
  }

  if (parsed.status === "tanya") {
    const pilihan = (parsed.pilihan ?? []).filter((p) => p.trim())
    const tipeJawaban: LevelAnswerType = parsed.tipeJawaban === "text" || pilihan.length === 0 ? "text" : parsed.tipeJawaban
    return { status: "tanya", pertanyaan: parsed.pertanyaan, tipeJawaban, pilihan }
  }

  return {
    status: "selesai",
    items: (parsed.items ?? []).map((it) => ({ ...it, qty: Math.max(1, Math.round(it.qty) || 1) })),
    ringkasan: parsed.ringkasan,
  }
}
