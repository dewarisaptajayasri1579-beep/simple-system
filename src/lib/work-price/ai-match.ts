import Anthropic from "@anthropic-ai/sdk"

import { PARAMETER_CODES, RUBRIC, optionCodes, priceFromPoints, totalPoints, type WeightScores } from "@/lib/work-price/rubric"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Sonnet 5 — tugasnya menilai 8 parameter bobot dari obrolan (butuh nalar & kalibrasi ke
 *  contoh), bukan olah data numerik berat seperti meta-ads/ai-insight.ts yang pakai Opus. */
const MODEL = "claude-sonnet-5"
const MAX_TOKENS = 4000

/** Maksimal pertanyaan klarifikasi dalam 1 obrolan sebelum AI WAJIB menyimpulkan harga, sesuai
 *  permintaan Owner — obrolan panjang bikin staf malas pakai fiturnya. 5 pertanyaan cukup untuk
 *  menggali 8 parameter karena beberapa parameter bisa ditanyakan sekaligus atau disimpulkan
 *  sendiri dari deskripsi awal. */
export const MAX_QUESTIONS = 5

export type WorkPriceCatalogItem = {
  id: string
  groupName: string
  level: string | null
  label: string
  description: string | null
  price: number
  weightPoints: number | null
  weightDetail: unknown
}

export type WorkPriceChatTurn = {
  role: "user" | "assistant"
  text: string
}

/** Satu unit pekerjaan hasil pecahan AI, lengkap dengan skor 8 parameternya. Poin & harga
 *  dihitung di server dari skor — model tidak pernah menyebut angka harga sendiri, supaya
 *  hasilnya selalu konsisten dengan rubrik. */
export type WorkPriceScoredJob = {
  nama: string
  qty: number
  scores: WeightScores
  alasan: string
  acuan: string | null
  poin: number
  hargaSatuan: number
  subtotal: number
}

/** Cara staf menjawab pertanyaan AI. "radio" = pilih satu, "checkbox" = boleh pilih beberapa,
 *  "text" = ketik bebas (dipakai kalau pertanyaannya memang tidak bisa dibuat pilihan). */
export type WorkPriceAnswerType = "radio" | "checkbox" | "text"

export type WorkPriceChatResult =
  | { status: "tanya"; pertanyaan: string; tipeJawaban: WorkPriceAnswerType; pilihan: string[] }
  | { status: "selesai"; pekerjaan: WorkPriceScoredJob[]; ringkasan: string; totalPoin: number; total: number }

function rubricText(): string {
  return PARAMETER_CODES.map((code) => {
    const p = RUBRIC[code]
    const opts = p.options.map((o) => `    - ${o.code} (${o.points} poin): ${o.label}`).join("\n")
    return `${code}. ${p.name}\n${opts}`
  }).join("\n\n")
}

/** Contoh pekerjaan yang skornya sudah dikalibrasi — dipakai model sebagai pembanding supaya
 *  penilaiannya tidak melenceng dari harga yang selama ini sudah dijual. */
function calibrationText(catalog: WorkPriceCatalogItem[]): string {
  return catalog
    .filter((c) => c.weightPoints !== null && c.weightDetail)
    .map((c) => {
      const d = c.weightDetail as Record<string, string>
      const scoreStr = PARAMETER_CODES.map((code) => `${code}=${d[code]}`).join(" ")
      return `- ${c.groupName}${c.level ? ` ${c.level}` : ` ${c.label}`} (${c.weightPoints} poin) [id:${c.id}]: ${c.description ?? ""}\n  skor: ${scoreStr}`
    })
    .join("\n")
}

const SYSTEM_PROMPT = `Kamu membantu staf software house Indonesia memperkirakan harga request custom pekerjaan dari client, lewat obrolan singkat.

Harga TIDAK dipilih dari daftar, tapi DIHITUNG dari bobot pekerjaan. Tugasmu: gali informasi secukupnya lewat obrolan, lalu nilai 8 parameter bobot untuk tiap unit pekerjaan. Sistem yang menghitung poin & rupiahnya — kamu TIDAK perlu (dan tidak boleh) menyebut angka harga sendiri.

Cara kerja:
1. Staf kasih deskripsi awal pekerjaan — biasanya kurang detail untuk menilai semua parameter dengan yakin.
2. Kalau masih ada parameter penting yang belum jelas, ajukan SATU pertanyaan yang paling menentukan harga. Boleh gabung 2 parameter dalam 1 pertanyaan kalau nyambung. Pertanyaan harus konkret & gampang dijawab singkat.
2b. SELALU sediakan pilihan jawaban supaya staf tinggal klik, jangan suruh mengetik kalau tidak perlu:
   - "radio" (pilih satu) untuk pertanyaan yang jawabannya saling meniadakan — ini yang PALING SERING dipakai. Isi "pilihan" dengan 2-5 jawaban yang mencerminkan opsi parameter terkait, ditulis dalam bahasa staf (bukan kode parameter). Selalu sisipkan opsi "Belum tahu / tentukan saja yang wajar" kalau masuk akal.
   - "checkbox" (boleh beberapa) untuk pertanyaan "apa saja yang dibutuhkan".
   - "text" HANYA kalau jawabannya benar-benar tidak bisa dibuat pilihan (mis. minta sebutkan nama data). Untuk "text", kosongkan "pilihan".
3. Kamu HANYA boleh bertanya maksimal ${MAX_QUESTIONS} kali total. Sistem kasih tahu tiap giliran sudah berapa kali kamu bertanya. Begitu mentok, WAJIB langsung simpulkan dengan asumsi paling masuk akal dari jawaban yang ada.
4. Parameter yang sudah jelas dari deskripsi JANGAN ditanyakan lagi — simpulkan sendiri.
5. Saat menyimpulkan: pecah jadi beberapa unit pekerjaan kalau deskripsi menyebut beberapa kebutuhan terpisah (mis. "master data supplier + laporan penjualan" = 2 unit). Tiap unit dinilai 8 parameternya sendiri.
6. Pakai contoh terkalibrasi sebagai pembanding: cari pekerjaan sejenis di daftar contoh, lalu sesuaikan skormu supaya adil dibanding contoh itu. Isi "acuan" dengan id contoh terdekat (atau null kalau memang tidak ada yang mirip).
7. "alasan" tiap unit: 1 kalimat, sebut parameter yang paling menentukan dan kenapa, merujuk ke jawaban staf.

Format jawaban WAJIB ikut skema JSON:
- status "tanya": isi "pertanyaan", "tipeJawaban", dan "pilihan"; kosongkan "pekerjaan" (array kosong) dan "ringkasan" (string kosong).
- status "selesai": kosongkan "pertanyaan" (string kosong), "pilihan" (array kosong), isi "pekerjaan" dan "ringkasan".

Bahasa Indonesia santai tapi profesional, seperti bicara ke rekan kerja.`

/** Tambahan instruksi untuk form pengajuan yang diisi programmer. Programmer TIDAK boleh tahu
 *  harga maupun kategori/level pricelist — penilaian bobot tetap jalan di balik layar, tapi yang
 *  dia baca cuma konfirmasi bahwa pekerjaannya sudah dimengerti. */
const FORM_MODE_PROMPT = `KONTEKS KHUSUS: lawan bicaramu adalah PROGRAMMER yang mencatat permintaan client, BUKAN staf penjualan.

Aturan tambahan yang WAJIB dipatuhi:
- JANGAN pernah menyebut harga, poin, bobot, biaya, kategori pricelist, atau nama level apa pun (mis. "LEV-2", "Transaksi LEV-3") di "pertanyaan" maupun "ringkasan". Programmer tidak boleh tahu soal harga.
- "ringkasan" ditulis sebagai KONFIRMASI PEMAHAMAN: tulis ulang pekerjaannya dengan bahasa teknis yang jelas — apa yang dibuat, data apa yang terlibat, aturan/alurnya bagaimana — supaya programmer bisa mengoreksi kalau ada yang salah tangkap. 2-4 kalimat.
- "alasan" tiap pekerjaan juga JANGAN menyebut level/harga; isi dengan ringkasan singkat ciri teknis pekerjaan itu.
- Penilaian 8 parameter tetap kamu isi seperti biasa (itu dipakai sistem di balik layar), cuma jangan dibahas dalam kalimat ke programmer.`

function buildOutputSchema() {
  const scoreProps: Record<string, unknown> = {}
  for (const code of PARAMETER_CODES) {
    scoreProps[code] = { type: "string", enum: optionCodes(code), description: RUBRIC[code].name }
  }

  return {
    type: "object",
    additionalProperties: false,
    required: ["status", "pertanyaan", "tipeJawaban", "pilihan", "pekerjaan", "ringkasan"],
    properties: {
      status: { type: "string", enum: ["tanya", "selesai"], description: "'tanya' kalau masih perlu klarifikasi, 'selesai' kalau sudah bisa dinilai." },
      pertanyaan: { type: "string", description: "Satu pertanyaan klarifikasi. String kosong kalau status 'selesai'." },
      tipeJawaban: { type: "string", enum: ["radio", "checkbox", "text"], description: "Cara staf menjawab: radio (pilih satu), checkbox (boleh beberapa), text (ketik bebas)." },
      pilihan: {
        type: "array",
        description: "Pilihan jawaban dalam bahasa staf. Kosongkan untuk tipeJawaban 'text' atau status 'selesai'.",
        items: { type: "string" },
      },
      pekerjaan: {
        type: "array",
        description: "Unit pekerjaan beserta skor bobotnya. Array kosong kalau status 'tanya'.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nama", "qty", "alasan", "acuan", ...PARAMETER_CODES],
          properties: {
            nama: { type: "string", description: "Nama singkat unit pekerjaan ini." },
            qty: { type: "integer", description: "Jumlah unit pekerjaan ini, minimal 1." },
            alasan: { type: "string" },
            acuan: { type: ["string", "null"], description: "Id contoh terkalibrasi yang jadi pembanding, atau null." },
            ...scoreProps,
          },
        },
      },
      ringkasan: { type: "string", description: "Ringkasan akhir ke staf, tanpa menyebut angka rupiah. String kosong kalau status 'tanya'." },
    },
  } as const
}

type RawJob = { nama: string; qty: number; alasan: string; acuan: string | null } & Record<string, string | number | null>

export async function continueWorkPriceChat(
  history: WorkPriceChatTurn[],
  catalog: WorkPriceCatalogItem[],
  questionsAsked: number,
  mode: "internal" | "form" = "internal"
): Promise<WorkPriceChatResult> {
  if (history.length === 0) throw new Error("Deskripsi pekerjaan wajib diisi")

  const statusNote =
    questionsAsked >= MAX_QUESTIONS
      ? `Kamu sudah bertanya ${questionsAsked}/${MAX_QUESTIONS} kali. WAJIB kembalikan status "selesai" sekarang — jangan bertanya lagi.`
      : `Kamu sudah bertanya ${questionsAsked}/${MAX_QUESTIONS} kali di obrolan ini.`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `RUBRIK BOBOT:\n\n${rubricText()}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: `CONTOH PEKERJAAN TERKALIBRASI:\n${calibrationText(catalog)}`, cache_control: { type: "ephemeral" } },
      ...(mode === "form" ? [{ type: "text" as const, text: FORM_MODE_PROMPT }] : []),
      { type: "text", text: statusNote },
    ],
    output_config: { format: { type: "json_schema", schema: buildOutputSchema() as unknown as Record<string, unknown> } },
    messages: history.map((h) => ({ role: h.role, content: h.text })),
  })

  if (response.stop_reason === "refusal") throw new Error("Analisa ditolak oleh filter keamanan model")

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")

  if (!text.trim()) throw new Error("Model tidak mengembalikan hasil analisa")

  const parsed = JSON.parse(text) as {
    status: "tanya" | "selesai"
    pertanyaan: string
    tipeJawaban: WorkPriceAnswerType
    pilihan: string[]
    pekerjaan: RawJob[]
    ringkasan: string
  }

  // Jaring pengaman: kalau model tetap ngotot nanya padahal sudah mentok limit, paksa selesai
  // supaya staf tidak kejebak obrolan tanpa akhir.
  if (parsed.status === "tanya" && questionsAsked >= MAX_QUESTIONS) {
    return { status: "selesai", pekerjaan: [], ringkasan: "Belum cukup yakin menilai bobotnya dari jawaban yang ada — perlu dicek manual oleh staf/Owner.", totalPoin: 0, total: 0 }
  }

  if (parsed.status === "tanya") {
    const pilihan = (parsed.pilihan ?? []).filter((p) => p.trim())
    // Model kadang bilang "radio"/"checkbox" tapi lupa mengisi pilihannya — jatuhkan ke input
    // teks daripada menampilkan daftar pilihan kosong yang bikin staf mentok.
    const tipeJawaban: WorkPriceAnswerType = parsed.tipeJawaban === "text" || pilihan.length === 0 ? "text" : parsed.tipeJawaban
    return { status: "tanya", pertanyaan: parsed.pertanyaan, tipeJawaban, pilihan }
  }

  const pekerjaan: WorkPriceScoredJob[] = (parsed.pekerjaan ?? []).map((job) => {
    const scores = Object.fromEntries(PARAMETER_CODES.map((code) => [code, String(job[code] ?? "")])) as WeightScores
    const poin = totalPoints(scores)
    const hargaSatuan = priceFromPoints(poin)
    const qty = Math.max(1, Math.round(job.qty) || 1)
    return { nama: job.nama, qty, scores, alasan: job.alasan, acuan: job.acuan, poin, hargaSatuan, subtotal: hargaSatuan * qty }
  })

  const totalPoin = pekerjaan.reduce((sum, j) => sum + j.poin * j.qty, 0)
  const total = pekerjaan.reduce((sum, j) => sum + j.subtotal, 0)

  return { status: "selesai", pekerjaan, ringkasan: parsed.ringkasan, totalPoin, total }
}
