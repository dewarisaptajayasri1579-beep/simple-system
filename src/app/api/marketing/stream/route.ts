import { getMarketingApiUser } from "@/lib/marketing/auth"
import { subscribeMarketingEvents } from "@/lib/marketing/realtime"

/**
 * GET /api/marketing/stream — Server-Sent Events. Browser menahan koneksi ini terus; server
 * mendorong 1 frame tiap ada event realtime (pesan masuk/keluar, notifikasi baru). Bukan
 * polling, bukan cron — murni dipicu webhook WAHUB / aksi kirim balasan.
 *
 * Event yang dikirim: `message` (semua anggota tim, inbox transparan) & `notification`
 * (hanya untuk user pemilik). Client tinggal refetch endpoint yang sudah ada saat menerima.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const encoder = new TextEncoder()
  let closed = false
  let unsub: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function cleanup() {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        unsub?.()
        request.signal.removeEventListener("abort", cleanup)
        try {
          controller.close()
        } catch {
          /* sudah ketutup */
        }
      }

      const send = (payload: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          cleanup()
        }
      }

      // Saran retry 3 dtk kalau koneksi putus + tanda siap.
      send("retry: 3000\n\n")
      send("event: ready\ndata: {}\n\n")

      unsub = subscribeMarketingEvents((evt) => {
        if (evt.type === "notification" && evt.userId !== user.id) return
        send(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`)
      })

      // Heartbeat: jaga koneksi hidup lewat proxy yang suka nutup idle connection.
      heartbeat = setInterval(() => send(": ping\n\n"), 25000)

      request.signal.addEventListener("abort", cleanup)
    },
    cancel() {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      unsub?.()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx: jangan buffer response ini.
      "X-Accel-Buffering": "no",
    },
  })
}
