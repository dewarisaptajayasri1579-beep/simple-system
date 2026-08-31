/** Transkrip rekaman panggilan (Detail Lead > Rekam Panggilan) lewat OpenAI Whisper API — pakai
 *  fetch + FormData/Blob bawaan Node, tidak perlu install SDK "openai" cuma buat 1 endpoint ini.
 *  `language: "id"` dikasih sebagai bias (bukan paksaan) supaya lebih akurat buat obrolan
 *  Bahasa Indonesia dengan campuran istilah bisnis/Inggris. */
export async function transcribeAudio(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY belum di-set di server")

  const form = new FormData()
  form.append("file", new Blob([buffer], { type: mimeType }), filename)
  form.append("model", "whisper-1")
  form.append("language", "id")
  form.append("response_format", "text")

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Gagal transkrip lewat Whisper (${res.status}): ${text.slice(0, 300)}`)
  }

  return (await res.text()).trim()
}
