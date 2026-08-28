"use client"

import { useEffect } from "react"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/** Daftarkan service worker + (kalau VAPID di-set & izin diberikan) subscribe Web Push.
 *  Diam-diam no-op kalau browser tidak dukung / VAPID belum ada / user menolak izin. */
export const PushRegister: React.FC = () => {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    let cancelled = false

    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
        if (cancelled) return

        const res = await fetch("/api/marketing/push")
        const { vapidPublicKey } = await res.json()
        if (!vapidPublicKey) return

        if (Notification.permission === "denied") return
        if (Notification.permission === "default") {
          const p = await Notification.requestPermission()
          if (p !== "granted") return
        }

        const existing = await reg.pushManager.getSubscription()
        const sub =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }))

        await fetch("/api/marketing/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sub.toJSON(), deviceName: navigator.userAgent.slice(0, 80) }),
        })
      } catch {
        /* abaikan — push opsional */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
