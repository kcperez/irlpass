import { getUser } from "./_lib.js"

// POST { t, text, to } -> { text, from }. chats run in english and spanish at
// once, so any member can tap "translate" on any message. google's public
// endpoint first (no key), mymemory as the fallback when google rate-limits.
// results are cached per warm instance.
const cache = new Map()

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const text = String(req.body?.text || "").trim().slice(0, 1000)
  const to = ["en", "es", "pt", "fr", "de", "it"].includes(req.body?.to) ? req.body.to : "en"
  if (!text) return res.status(400).json({ error: "nothing to translate" })

  const key = `${to}:${text}`
  if (cache.has(key)) return res.status(200).json(cache.get(key))

  const out = (await google(text, to).catch(() => null)) || (await mymemory(text, to).catch(() => null))
  if (!out?.text) {
    console.error("translate error: both providers failed")
    return res.status(502).json({ error: "couldn't translate that right now" })
  }
  if (cache.size > 500) cache.clear()
  cache.set(key, out)
  return res.status(200).json(out)
}

async function google(text, to) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`google ${r.status}`)
  const d = await r.json()
  return { text: (d?.[0] || []).map((seg) => seg?.[0] || "").join(""), from: d?.[2] || null }
}

// mymemory needs a source language. our chats are english/spanish, so the
// source is the other one of the pair.
async function mymemory(text, to) {
  const from = to === "en" ? "es" : "en"
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}&de=hello@irlpass.xyz`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`mymemory ${r.status}`)
  const d = await r.json()
  if (d?.responseStatus !== 200) throw new Error(`mymemory ${d?.responseStatus}`)
  return { text: d.responseData?.translatedText || "", from }
}
