// irlpass push: show the ping, and open the right screen when it's tapped
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

self.addEventListener("push", (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(
    self.registration.showNotification(d.title || "irlpass", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/favicon-96.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/" },
    })
  )
})

self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || "/"
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("irlpass.xyz") && "focus" in c) { c.navigate(url); return c.focus() }
      }
      return self.clients.openWindow(url)
    })
  )
})
