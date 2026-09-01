/* Service worker modul Marketing (Simple Lead) — fokus Web Push + klik notifikasi.
   Tidak melakukan precache agresif; cuma lewatkan fetch apa adanya. */

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    data = { title: "Notifikasi", body: event.data ? event.data.text() : "" }
  }
  // Push "senyap" — bukan pesan baru, cuma perintah nutup notif bertag ini yang sudah dibaca
  // lewat jalur lain (lihat closeWebPushNotification di notify.ts). Tidak menampilkan apa pun.
  if (data.closeTag) {
    event.waitUntil(
      self.registration.getNotifications({ tag: data.closeTag }).then((list) => list.forEach((n) => n.close())),
    )
    return
  }

  const title = data.title || "SEVEN OS — Marketing"
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/marketing" },
    tag: data.tag || undefined,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/marketing"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
