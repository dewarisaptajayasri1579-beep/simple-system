import Anthropic from "@anthropic-ai/sdk"

import { prisma } from "@/lib/prisma"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { getMarketingSetting } from "@/lib/marketing/settings"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
/** Default: Haiku (murah, dipakai cron auto-reanalysis & saran balasan). Tombol "Analisa AI"
 *  manual pakai Sonnet (lebih tajam) — lihat POST /api/marketing/leads/[id]/ai. */
export const AI_MODEL_FAST = "claude-haiku-4-5"
export const AI_MODEL_DEEP = "claude-sonnet-5"
const PROMPT_VERSION = "mkt-v1"

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence ? fence[1] : text
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("Tidak ada JSON di respons AI")
  return JSON.parse(raw.slice(start, end + 1))
}

async function loadTranscript(leadId: string, limit = 40) {
  const messages = await prisma.message.findMany({
    where: { conversation: { leadId } },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: { direction: true, body: true, sentAt: true },
  })
  return messages
    .reverse()
    .map((m) => `${m.direction === "INBOUND" ? "Customer" : "Sales"}: ${m.body ?? "(non-teks)"}`)
    .join("\n")
}

/** Analisa 1 lead sekali jalan → 5 record LeadAiAnalysis (SEGMENTATION, PROFILING, SUMMARY,
 *  NEXT_BEST_ACTION, BUYING_SIGNAL). Non-blocking; kegagalan disimpan sebagai row FAILED.
 *  Auto-apply segmentasi kalau confidence tinggi & lead belum bersegmen. */
export async function analyzeLead(leadId: string, opts: { model?: string } = {}) {
  const MODEL = opts.model ?? AI_MODEL_FAST
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, displayName: true, companyName: true, segmentId: true },
  })
  if (!lead) throw new Error("Lead tidak ditemukan")

  const [segments, transcript, autoApplyConfidence] = await Promise.all([
    prisma.segment.findMany({ where: { isActive: true }, select: { code: true, name: true, aiContext: true } }),
    loadTranscript(leadId),
    getMarketingSetting("ai.segment_auto_apply_confidence"),
  ])

  if (!transcript.trim()) throw new Error("Belum ada percakapan untuk dianalisa")

  const system = `Kamu analis sales B2B software di Indonesia. Baca transkrip WhatsApp lead lalu keluarkan HANYA JSON valid (tanpa penjelasan lain) dengan bentuk:
{
  "segmentation": { "segmentCode": "<salah satu code>", "confidence": 0..1, "reason": "..." },
  "profiling": { "companySize": "kecil|menengah|besar|tidak jelas", "buyingPower": 0..100, "buyingInterest": 0..100, "need": 0..100, "closingProbability": 0..100, "summary": "..." },
  "summary": { "customerContext": "...", "needs": "...", "painPoints": "...", "objections": "...", "lastCommitment": "...", "nextAction": "..." },
  "nextBestAction": { "action": "CONTINUE_DISCUSSION|SCHEDULE_DEMO|SEND_PROPOSAL|FOLLOW_UP|NEGOTIATE|ESCALATE|WAIT_UNTIL_DATE", "reason": "...", "confidence": 0..1 },
  "buyingSignal": { "score": 0..100, "reason": "..." }
}
Segment yang tersedia: ${segments.map((s) => `${s.code} (${s.name})`).join(", ")}.
Kalau info kurang, tetap beri estimasi terbaik dengan confidence rendah.`

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system,
    messages: [{ role: "user", content: `Lead: ${lead.displayName}${lead.companyName ? ` (${lead.companyName})` : ""}\n\nTranskrip:\n${transcript}` }],
  })
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any
  try {
    parsed = extractJson(text)
  } catch (e) {
    await prisma.leadAiAnalysis.create({
      data: {
        leadId,
        analysisType: "SUMMARY",
        version: await nextVersion(leadId, "SUMMARY"),
        modelName: MODEL,
        promptVersion: PROMPT_VERSION,
        outputJson: { raw: text.slice(0, 2000) },
        status: "FAILED",
        errorCode: "PARSE_ERROR",
      },
    })
    throw e
  }

  const pairs: [string, unknown, number | null][] = [
    ["SEGMENTATION", parsed.segmentation, num(parsed.segmentation?.confidence)],
    ["PROFILING", parsed.profiling, null],
    ["SUMMARY", parsed.summary, null],
    ["NEXT_BEST_ACTION", parsed.nextBestAction, num(parsed.nextBestAction?.confidence)],
    ["BUYING_SIGNAL", parsed.buyingSignal, null],
  ]

  for (const [type, output, confidence] of pairs) {
    if (output == null) continue
    await prisma.leadAiAnalysis.create({
      data: {
        leadId,
        analysisType: type,
        version: await nextVersion(leadId, type),
        modelName: MODEL,
        promptVersion: PROMPT_VERSION,
        outputJson: output as object,
        confidence,
        status: "SUCCESS",
      },
    })
  }

  // Auto-apply segmentasi bila yakin & lead belum bersegmen
  const segCode: string | undefined = parsed.segmentation?.segmentCode
  const segConf = num(parsed.segmentation?.confidence) ?? 0
  if (!lead.segmentId && segCode && segConf >= autoApplyConfidence) {
    const seg = await prisma.segment.findUnique({ where: { code: segCode }, select: { id: true } })
    if (seg) {
      await prisma.$transaction([
        prisma.lead.update({ where: { id: leadId }, data: { segmentId: seg.id } }),
        prisma.leadSegmentHistory.create({
          data: { leadId, toSegmentId: seg.id, source: "AI", confidence: segConf, reason: parsed.segmentation?.reason ?? null },
        }),
      ])
    }
  }

  await recalcLeadDerived(leadId).catch(() => {})
  return { ok: true }
}

/** 3 draf balasan (PROFESSIONAL, CASUAL, CLOSING) untuk 1 conversation → LeadAiSuggestion rows. */
export async function suggestReplies(conversationId: string) {
  const MODEL = AI_MODEL_FAST
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, leadId: true, lead: { select: { displayName: true } } },
  })
  if (!conv) throw new Error("Percakapan tidak ditemukan")

  const transcript = await loadTranscript(conv.leadId, 20)
  if (!transcript.trim()) throw new Error("Belum ada percakapan")

  const system = `Kamu sales software Indonesia. Berdasarkan transkrip WhatsApp, buat 3 draf balasan singkat (maks 3 kalimat) dalam Bahasa Indonesia. Keluarkan HANYA JSON:
{ "professional": "...", "casual": "...", "closing": "..." }
professional = formal & to the point; casual = ramah santai; closing = dorong ke langkah berikutnya (demo/penawaran/deal).`

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: `Lead: ${conv.lead.displayName}\n\nTranskrip:\n${transcript}` }],
  })
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: any = extractJson(text)

  const styles: [string, string][] = [
    ["PROFESSIONAL", parsed.professional],
    ["CASUAL", parsed.casual],
    ["CLOSING", parsed.closing],
  ]
  const created = []
  for (const [style, body] of styles) {
    if (typeof body !== "string" || !body.trim()) continue
    const s = await prisma.leadAiSuggestion.create({
      data: { leadId: conv.leadId, conversationId, style, text: body.trim(), modelName: MODEL, promptVersion: PROMPT_VERSION },
      select: { id: true, style: true, text: true },
    })
    created.push(s)
  }
  return created
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

async function nextVersion(leadId: string, analysisType: string) {
  const last = await prisma.leadAiAnalysis.findFirst({
    where: { leadId, analysisType },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  return (last?.version ?? 0) + 1
}
