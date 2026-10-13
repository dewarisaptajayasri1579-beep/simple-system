import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Sonnet 5 — tugasnya menilai kecocokan deskripsi pekerjaan ke level pricelist (butuh nalar,
 *  bukan sekadar lookup), tapi tidak sekompleks menganalisa data numerik besar seperti
 *  meta-ads/ai-insight.ts yang pakai Opus. */
const MODEL = "claude-sonnet-5"
const MAX_TOKENS = 4000

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

export type WorkPriceMatchResult = {
  items: WorkPriceMatchedItem[]
  ringkasan: string
}

const SYSTEM_PROMPT = `Kamu membantu staf software house Indonesia memperkirakan harga request custom pekerjaan dari client, berdasarkan pricelist internal yang levelnya sudah ditentukan.

Tugasmu: baca deskripsi pekerjaan bebas dari staf, lalu cocokkan ke satu atau lebih item di pricelist (dengan quantity-nya) yang paling pas menggambarkan pekerjaan itu.

Cara kerja:
1. Pecah deskripsi jadi beberapa kebutuhan kalau memang menyebut beberapa hal sekaligus (mis. "bikin master data supplier dan laporan penjualan bulanan" = 1 item Master Data + 1 item Laporan).
2. Pilih level berdasarkan kompleksitas yang tersirat dari deskripsi, bandingkan dengan "keterangan" tiap item di pricelist — JANGAN asal pilih level tengah.
3. Qty > 1 kalau deskripsi jelas menyebut pekerjaan itu berulang (mis. "5 master data" = qty 5).
4. Kalau ada item di pricelist dengan harga 0 (belum ada acuan harga) dan itu yang paling cocok, tetap pilih itu — staf akan tahu dari harga 0 bahwa perlu nego manual.
5. Kalau deskripsi terlalu kabur untuk dipetakan ke pricelist sama sekali, kembalikan items kosong dan jelaskan kenapa di ringkasan.
6. itemId WAJIB persis salah satu id dari daftar pricelist yang diberikan — jangan mengarang id.

Tulis "alasan" tiap item singkat (1 kalimat) kenapa level itu yang dipilih, merujuk ke kata kunci dari deskripsi staf. Tulis "ringkasan" 1-2 kalimat total untuk staf.`

function buildOutputSchema(validIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items", "ringkasan"],
    properties: {
      items: {
        type: "array",
        description: "Item pricelist yang cocok dengan deskripsi pekerjaan, bisa kosong kalau tidak ada yang cocok.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["itemId", "qty", "alasan"],
          properties: {
            itemId: { type: "string", enum: validIds, description: "Id item pricelist yang dipilih." },
            qty: { type: "integer", description: "Jumlah unit pekerjaan ini, minimal 1." },
            alasan: { type: "string" },
          },
        },
      },
      ringkasan: { type: "string" },
    },
  } as const
}

export async function matchWorkPriceItems(description: string, catalog: WorkPriceCatalogItem[]): Promise<WorkPriceMatchResult> {
  if (catalog.length === 0) throw new Error("Pricelist belum ada datanya")

  const payload = catalog.map((c) => ({
    id: c.id,
    kategori: c.groupName,
    level: c.level,
    label: c.label,
    keterangan: c.description,
    harga: c.price,
  }))

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: buildOutputSchema(catalog.map((c) => c.id)) as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: `Daftar pricelist (JSON):\n${JSON.stringify(payload, null, 2)}\n\nDeskripsi pekerjaan dari staf:\n"""${description}"""`,
      },
    ],
  })

  if (response.stop_reason === "refusal") throw new Error("Analisa ditolak oleh filter keamanan model")

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")

  if (!text.trim()) throw new Error("Model tidak mengembalikan hasil analisa")

  return JSON.parse(text) as WorkPriceMatchResult
}
