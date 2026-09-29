// show the last answer instantly, then swap in the fresh one. screens open on
// real content instead of a spinner while the network catches up.
const read = (key) => {
  try { return JSON.parse(sessionStorage.getItem(`irl:${key}`) || "null") } catch { return null }
}
const write = (key, value) => {
  try { sessionStorage.setItem(`irl:${key}`, JSON.stringify(value)) } catch { /* full or private mode */ }
}

export function cachedJson(url, onData) {
  const hit = read(url)
  if (hit) onData(hit, true)
  return fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => { write(url, d); onData(d, false); return d })
}
