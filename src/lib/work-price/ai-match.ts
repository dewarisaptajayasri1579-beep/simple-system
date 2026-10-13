import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Sonnet 5 — tugasnya menilai kecocokan deskripsi pekerjaan ke level pricelist (butuh nalar,
 *  bukan sekadar lookup), tapi tidak sekompleks menganalisa data numerik besar seperti
 *  meta-ads/ai-insight.ts yang pakai Opus. */
const MODEL = "claude-sonnet-5"
const MAX_TOKENS = 4000

/** Maksimal pertanyaan klarifikasi dalam 1 obrolan sebelum AI WAJIB menyimpulkan harga, sesuai
 *  permintaan Owner — obrolan panjang bikin staf malas pakai fiturnya. */
export const MAX_QUESTIONS = 5

export type WorkPriceCatalogItem = {
  id: string
  groupName: string
  level: string | null
  label: string
  description: string | null
  price: number
}

export type WorkPriceMatchedItem = {
  itemId: string
  qty: number
  alasan: string
}

export type WorkPriceChatTurn = {
  role: "user" | "assistant"
  text: string
}

export type WorkPriceChatResult =
  | { status: "tanya"; pertanyaan: string }
  | { status: "selesai"; items: WorkPriceMatchedItem[]; ringkasan: string }

const SYSTEM_PROMPT = `Kamu membantu staf software house Indonesia memperkirakan harga request custom pekerjaan dari client, lewat obrolan singkat, berdasarkan pricelist internal yang level & kriterianya sudah ditentukan.

Cara kerja:
1. Staf kasih deskripsi awal pekerjaan — biasanya kurang detail untuk menentukan level dengan yakin.
2. Kalau informasi belum cukup untuk memilih level secara yakin (cocokkan ke kriteria tiap item di pricelist, yang sudah ditulis terukur: jumlah tabel, jumlah field, ada approval atau tidak, dsb), ajukan SATU pertanyaan paling penting dulu — yang jawabannya paling menentukan level mana yang cocok. Pertanyaan harus konkret dan gampang dijawab staf (hindari pertanyaan terbuka yang susah dijawab singkat), dan idealnya mengarah ke pilihan ya/tidak atau angka.
3. Kamu HANYA boleh bertanya maksimal ${MAX_QUESTIONS} kali total dalam satu obrolan. Sistem akan kasih tahu di setiap giliran sudah berapa kali kamu bertanya. Begitu sudah mencapai batas, kamu WAJIB langsung simpulkan dengan asumsi terbaik dari jawaban yang sudah ada — jangan tanya lagi walau belum yakin 100%.
4. Begitu cukup yakin (atau sudah mentok pertanyaan), simpulkan: pecah jadi satu atau lebih item pricelist dengan qty-nya kalau deskripsi menyebut beberapa kebutuhan sekaligus, kasih alasan singkat tiap item merujuk ke kriteria & jawaban staf, dan satu ringkasan akhir.
5. Kalau ada item di pricelist dengan harga 0 (belum ada acuan harga) dan itu yang paling cocok, tetap pilih itu — staf akan tahu dari harga 0 bahwa perlu nego manual.
6. Kalau deskripsi+jawaban staf tetap tidak bisa dipetakan ke pricelist sama sekali, kembalikan items kosong dan jelaskan kenapa di ringkasan.
7. itemId WAJIB persis salah satu id dari daftar pricelist yang diberikan — jangan mengarang id.

Format jawaban WAJIB ikut skema JSON yang diberikan:
- status "tanya": isi "pertanyaan", kosongkan "items" (array kosong) dan "ringkasan" (string kosong).
- status "selesai": kosongkan "pertanyaan" (string kosong), isi "items" dan "ringkasan".

Bahasa Indonesia santai tapi profesional, seperti bicara ke rekan kerja.`

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "pertanyaan", "items", "ringkasan"],
  properties: {
    status: { type: "string", enum: ["tanya", "selesai"], description: "'tanya' kalau masih perlu klarifikasi, 'selesai' kalau sudah bisa kasih estimasi." },
    pertanyaan: { type: "string", description: "Satu pertanyaan klarifikasi ke staf. String kosong kalau status 'selesai'." },
    items: {
      type: "array",
      description: "Item pricelist yang cocok. Kosongkan (array kosong) kalau status 'tanya'.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "qty", "alasan"],
        properties: {
          itemId: { type: "string" },
          qty: { type: "integer", description: "Jumlah unit pekerjaan ini, minimal 1." },
          alasan: { type: "string" },
        },
      },
    },
    ringkasan: { type: "string", description: "Ringkasan akhir ke staf. String kosong kalau status 'tanya'." },
  },
} as const

function buildOutputSchema(validIds: string[]) {
  return {
    ...OUTPUT_SCHEMA,
    properties: {
      ...OUTPUT_SCHEMA.properties,
      items: {
        ...OUTPUT_SCHEMA.properties.items,
        items: {
          ...OUTPUT_SCHEMA.properties.items.items,
          properties: {
            ...OUTPUT_SCHEMA.properties.items.items.properties,
            itemId: { type: "string", enum: validIds, description: "Id item pricelist yang dipilih." },
          },
        },
      },
    },
  } as const
}

export async function continueWorkPriceChat(
  history: WorkPriceChatTurn[],
  catalog: WorkPriceCatalogItem[],
  questionsAsked: number
): Promise<WorkPriceChatResult> {
  if (catalog.length === 0) throw new Error("Pricelist belum ada datanya")
  if (history.length === 0) throw new Error("Deskripsi pekerjaan wajib diisi")

  const payload = catalog.map((c) => ({
    id: c.id,
    kategori: c.groupName,
    level: c.level,
    label: c.label,
    keterangan: c.description,
    harga: c.price,
  }))

  const statusNote =
    questionsAsked >= MAX_QUESTIONS
      ? `Kamu sudah bertanya ${questionsAsked}/${MAX_QUESTIONS} kali. WAJIB kembalikan status "selesai" sekarang — jangan bertanya lagi.`
      : `Kamu sudah bertanya ${questionsAsked}/${MAX_QUESTIONS} kali di obrolan ini.`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Daftar pricelist (JSON):\n${JSON.stringify(payload, null, 2)}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: statusNote },
    ],
    output_config: { format: { type: "json_schema", schema: buildOutputSchema(catalog.map((c) => c.id)) as unknown as Record<string, unknown> } },
    messages: history.map((h) => ({ role: h.role, content: h.text })),
  })

  if (response.stop_reason === "refusal") throw new Error("Analisa ditolak oleh filter keamanan model")

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")

  if (!text.trim()) throw new Error("Model tidak mengembalikan hasil analisa")

  const parsed = JSON.parse(text) as { status: "tanya" | "selesai"; pertanyaan: string; items: WorkPriceMatchedItem[]; ringkasan: string }

  // Jaring pengaman: kalau model tetap ngotot nanya padahal sudah mentok limit, paksa selesai
  // supaya staf tidak kejebak obrolan tanpa akhir.
  if (parsed.status === "tanya" && questionsAsked >= MAX_QUESTIONS) {
    return { status: "selesai", items: [], ringkasan: "Belum cukup yakin menentukan levelnya dari jawaban yang ada — perlu dicek manual oleh staf/Owner." }
  }

  if (parsed.status === "tanya") return { status: "tanya", pertanyaan: parsed.pertanyaan }
  return { status: "selesai", items: parsed.items, ringkasan: parsed.ringkasan }
}
