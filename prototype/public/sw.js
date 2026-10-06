// irlpass: push pings, plus a cache so the app opens instantly on bad signal.
// - built files (/assets/*, hashed names) never change: cache first
// - photos (supabase storage): cache first, capped
// - the page itself: network first, cached copy if the network is slow or gone
// - /api/* always goes to the network (the app has its own data cache)
const V = "irl-v1"
const IMG = "irl-img-v1"
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V && k !== IMG).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
)

async function trim(name, max) {
  const c = await caches.open(name)
  const keys = await c.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k)
}

self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.pathname.startsWith("/api/")) return

  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.open(V).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r })))
    return
  }
  if (url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/public/")) {
    e.respondWith(caches.open(IMG).then(async (c) => {
      const hit = await c.match(req)
      if (hit) return hit
      const r = await fetch(req)
      if (r.ok || r.type === "opaque") { c.put(req, r.clone()); trim(IMG, 400) }
      return r
    }))
    return
  }
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    // fresh page first (so a new deploy's files always match), but if the
    // network takes more than 2s, open the cached one instead of waiting
    e.respondWith(caches.open(V).then(async (c) => {
      const fresh = fetch(req).then((r) => { if (r.ok) c.put("/", r.clone()); return r })
      const hit = await c.match("/")
      if (!hit) return fresh
      return Promise.race([fresh.catch(() => hit), new Promise((ok) => setTimeout(() => ok(hit), 2000))])
    }))
  }
})

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
