import Anthropic from "@anthropic-ai/sdk"

import { jakartaNowIso } from "@/lib/datetime"
import { prisma } from "@/lib/prisma"
import { runTool, staffToolDefinitions, clientToolDefinitions, type ToolContext } from "@/lib/agent-tools"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = "claude-haiku-4-5"
const MAX_TOOL_ITERATIONS = 6
const MAX_TOKENS = 500
const MAX_HISTORY_MESSAGES = 16

const STAFF_SYSTEM_PROMPT = `Kamu adalah asisten AI internal SEVEN OS — bantu staf (Owner/Direktur/Admin) cek piutang, domain, biaya berkala, kas/bank, dan catat transaksi lewat WhatsApp.

Gunakan tools yang tersedia untuk membaca/menyimpan data. Jangan pernah mengarang data — selalu ambil lewat tool.

Aturan:
1. Kalau pengguna bilang "sudah"/"belum" soal biaya berkala tanpa sebut nama jelas, panggil get_pending_bill_checkins dulu untuk cari tahu yang dimaksud. Kalau cuma ada satu yang pending, langsung proses (jangan tanya balik dua kali untuk hal yang sudah jelas dari konteks). Kalau ada lebih dari satu, sebutkan pilihannya dan tanya yang mana.
2. Saat record_expense/record_income, kalau nama akun tidak disebutkan, tanyakan dulu (jangan menebak akun mana yang dimaksud).
3. Selalu sebutkan nominal dalam format Rupiah.
4. Jawaban singkat, jelas, bahasa Indonesia santai tapi profesional.`

const CLIENT_SYSTEM_PROMPT = `Kamu adalah asisten penagihan SEVEN OS yang menjawab pertanyaan client soal tagihan mereka lewat WhatsApp.

Kamu HANYA boleh membahas invoice/tagihan milik client yang sedang chat — gunakan tools yang tersedia, jangan pernah mengarang data.

Aturan:
1. Kalau client bilang sudah transfer/bayar, panggil claim_payment — tapi WAJIB jelaskan bahwa ini akan diverifikasi staf dulu sebelum status berubah jadi lunas, bukan otomatis lunas saat itu juga.
2. Jangan pernah membahas data client lain, data internal perusahaan, atau topik di luar tagihan client ini.
3. Jawaban singkat, sopan, bahasa Indonesia.`

interface RunAgentParams {
  mode: "staff" | "client"
  /** userId (staff) atau clientId (client) — dipakai untuk audit trail agent_runs. */
  actorId: string
  command: string
  history?: Anthropic.MessageParam[]
}

export async function runAgent({ mode, actorId, command, history }: RunAgentParams) {
  const firstMessageText = `Waktu sekarang: ${jakartaNowIso()} (Asia/Jakarta).\n\nPerintah: ${command}`
  const trimmedHistory = (history ?? []).slice(-MAX_HISTORY_MESSAGES)
  const messages: Anthropic.MessageParam[] = [...trimmedHistory, { role: "user", content: firstMessageText }]

  const systemPrompt = mode === "staff" ? STAFF_SYSTEM_PROMPT : CLIENT_SYSTEM_PROMPT
  const toolDefinitions = mode === "staff" ? staffToolDefinitions : clientToolDefinitions
  const toolContext: ToolContext = mode === "staff" ? { mode: "staff" } : { mode: "client", clientId: actorId }

  let finalText = ""

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions,
      messages,
    })

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text")
    finalText = textBlocks.map((b) => b.text).join("\n")

    messages.push({ role: "assistant", content: response.content })

    if (toolUses.length === 0) break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const toolUse of toolUses) {
      let resultContent: string
      let status = "success"
      try {
        const result = await runTool(toolUse.name, toolUse.input as Record<string, unknown>, toolContext)
        resultContent = JSON.stringify(result)
      } catch (error) {
        status = "error"
        resultContent = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      }

      await prisma.agentRun.create({
        data: { actorType: mode, actorId, command, agentAction: toolUse.name, result: resultContent, status },
      })

      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: resultContent, is_error: status === "error" })
    }

    messages.push({ role: "user", content: toolResults })

    if (response.stop_reason !== "tool_use") break
  }

  return { reply: finalText, messages }
}
