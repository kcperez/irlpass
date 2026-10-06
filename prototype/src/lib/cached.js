// show the last answer instantly, then swap in the fresh one. screens open on
// real content instead of a spinner while the network catches up.
//
// three layers: memory (instant), then localStorage (survives closing the app,
// so a cold open still shows your last screen), and one shared request per url
// at a time. prefetch() warms tabs in the background so switching is instant.
const mem = new Map() // url -> { at, data }
const inflight = new Map() // url -> promise

const KEY = (url) => `irl:c:${url}`
const read = (url) => {
  if (mem.has(url)) return mem.get(url)
  try {
    const hit = JSON.parse(localStorage.getItem(KEY(url)) || "null")
    if (hit) mem.set(url, hit)
    return hit
  } catch { return null }
}
const write = (url, data) => {
  const hit = { at: Date.now(), data }
  mem.set(url, hit)
  try {
    localStorage.setItem(KEY(url), JSON.stringify(hit))
  } catch {
    // full: drop the oldest cached screens and try once more
    try {
      const old = Object.keys(localStorage).filter((k) => k.startsWith("irl:c:"))
        .map((k) => [k, JSON.parse(localStorage.getItem(k) || "{}").at || 0])
        .sort((a, b) => a[1] - b[1]).slice(0, 6)
      for (const [k] of old) localStorage.removeItem(k)
      localStorage.setItem(KEY(url), JSON.stringify(hit))
    } catch { /* private mode: memory only */ }
  }
}

function load(url) {
  if (inflight.has(url)) return inflight.get(url)
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => { write(url, d); return d })
    .finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}

export function cachedJson(url, onData) {
  const hit = read(url)
  if (hit) onData(hit.data, true)
  return load(url).then((d) => { onData(d, false); return d })
}

// warm a screen's data in the background (skipped if it's fresh already)
export function prefetch(url, maxAgeMs = 20000) {
  const hit = read(url)
  if (hit && Date.now() - hit.at < maxAgeMs) return
  load(url).catch(() => {})
}
