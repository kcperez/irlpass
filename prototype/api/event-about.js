import Anthropic from "@anthropic-ai/sdk"
import { db } from "./_db.js"
import { getUser } from "./_lib.js"

// the two lines at the top of an event: what it is, the vibe, who it's for.
// written once from the event's own page, in our voice, then cached on the row.
// GET ?t&id -> { about: { en, es } | null }
export const config = { maxDuration: 40 }
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

const SYSTEM = `you write the short description at the top of an event in irlpass, an app for meeting people at things happening in your city.
voice: lowercase, warm, plain, like a friend who's been. two sentences, 40 words max. say what it actually is, what the night or day feels like, and who'd love it. no hype words, no emojis, no em dashes, no "not x, it's y".
use only what the page and the details say. never invent artists, prices, perks or times. if there's little to go on, describe it simply from the title and venue.
also write it in natural latin american spanish.
answer with only json: {"en": "", "es": ""}`

const strip = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim()

// what the event's own page says about itself: og/meta description and json-ld
async function pageText(url) {
  if (!/^https?:\/\//.test(String(url || ""))) return ""
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; irlpass/1.0)", accept: "text/html" }, signal: AbortSignal.timeout(5000) })
    if (!r.ok) return ""
    const html = (await r.text()).slice(0, 400000)
    const bits = []
    for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["'][^>]*content=["']([^"']+)["']/gi)) bits.push(m[1])
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      const d = m[1].match(/"description"\s*:\s*"((?:[^"\\]|\\.){20,})"/)
      if (d) bits.push(d[1].replace(/\\n/g, " ").replace(/\\"/g, '"'))
    }
    return strip([...new Set(bits)].join("\n")).slice(0, 2500)
  } catch {
    return ""
  }
}

// ra blocks page fetches, but its own api hands over the write-up and lineup
async function raText(id) {
  try {
    const r = await fetch("https://ra.co/graphql", {
      method: "POST",
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "content-type": "application/json", referer: "https://ra.co/events" },
      body: JSON.stringify({ query: "query($id: ID!){ event(id: $id){ content lineup cost } }", variables: { id: String(id) } }),
      signal: AbortSignal.timeout(5000),
    })
    const e = (await r.json())?.data?.event
    return e ? strip(`${e.content || ""}\nlineup: ${e.lineup || ""}\ncost: ${e.cost || ""}`).slice(0, 2500) : ""
  } catch {
    return ""
  }
}

export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const id = Number(req.query?.id)
  const { data: e } = id ? await db.from("events").select("id, title, venue, address, host, category, starts_at, url, details, about, source, source_id").eq("id", id).maybeSingle() : { data: null }
  if (!e) return res.status(404).json({ error: "that event is gone" })
  if (e.about?.en) return res.status(200).json({ about: e.about })
  if (!client) return res.status(200).json({ about: null })

  try {
    const page = e.source === "ra" ? await raText(e.source_id) : await pageText(e.url)
    const msg = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1200,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `title: ${e.title}\nkind: ${e.category}\nvenue: ${e.venue || ""}${e.address ? `, ${e.address}` : ""}\nby: ${e.host || ""}\nwhen: ${e.starts_at}\nlisted on: ${e.source}\n${e.details ? `the host wrote: ${e.details.slice(0, 1500)}\n` : ""}${page ? `the event page says: ${page}` : "(no page text)"}`,
      }],
    })
    const m = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").match(/\{[\s\S]*\}/)
    const o = m ? JSON.parse(m[0]) : null
    if (!o?.en) return res.status(200).json({ about: null })
    const about = { en: String(o.en).slice(0, 400), es: String(o.es || o.en).slice(0, 400) }
    await db.from("events").update({ about }).eq("id", e.id)
    res.setHeader("cache-control", "private, max-age=3600")
    return res.status(200).json({ about })
  } catch (err) {
    console.error("event about error:", err?.status, err?.message)
    return res.status(200).json({ about: null })
  }
}
