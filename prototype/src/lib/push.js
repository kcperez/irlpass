// web push. on iphone it only works once irlpass is on the home screen
// (ios 16.4+), so "needs-install" is its own state.
export function pushState() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone
    return ios && !standalone ? "needs-install" : "unsupported"
  }
  return Notification.permission // default | granted | denied
}

export function registerSW() {
  if (!("serviceWorker" in navigator)) return
  navigator.serviceWorker.register("/sw.js").catch(() => {})
}

const b64 = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function enablePush(token) {
  const perm = await Notification.requestPermission()
  if (perm !== "granted") return false
  const { key } = await fetch("/api/push").then((r) => r.json())
  if (!key) return false
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }))
  const r = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ t: token, sub: sub.toJSON() }),
  })
  return r.ok
}

// ask at the moment it matters ("when they reply"), never on page load
export const askPush = (why) => window.dispatchEvent(new CustomEvent("irl:ask-push", { detail: why }))
