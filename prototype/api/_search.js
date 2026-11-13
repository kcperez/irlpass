import Anthropic from "@anthropic-ai/sdk"
import crypto from "crypto"
import { db } from "./_db.js"
import { kindOf, sourcesFor } from "./_events.js"
import { cityLabel } from "./_cities.js"

// ask a city anything. "football", "techno tonight", "dinner tonight", "airport
// to centro": claude reads what we have listed, picks events that fit, searches
// the web when that's thin (new events get added to the list), ranks places to
// eat and drink by the guides, and answers practical questions in a short tip.
// askCity(city, q) -> { reply, ids, near, places, tip } | { error, status }

const client = new Anthropic()
const DAYS = 14

const SYSTEM = `you help people find things to do in a city through irlpass, an app for meeting people at events.
you get the person's request and the list of events we already have for the next ${DAYS} days.
it's all about interests: never come back empty handed.
1. pick the listed events that genuinely fit the request, best first. read intent generously: "football" in europe means soccer matches, watch parties and five-a-side; "party" includes club nights, raves and live music; "food" includes wine and food festivals; "running" includes run clubs and races.
2. if fewer than 3 listed events fit, use web search to find real, specific upcoming events in this city in the next ${DAYS} days that fit (official club fixtures, venue calendars, ticket sites, run club instagram pages). only include events with a confirmed date. never invent anything.
3. if there still aren't 3 good fits, add the closest listed events by interest as "near": the same energy or the same kind of person. running -> other workouts, yoga, hikes, dancing, active social things; techno -> other club nights and live music; wine -> food, aperitivo, tastings. 3 to 6 near picks, best first. a listed event can be in picks or near, never both.
4. places: when the request is about somewhere to eat, drink, have coffee, brunch or go out (a restaurant tonight, aperitivo, best pizza, a cocktail bar, a specific place by name), also give the best real places in this city. use web search. rank by trusted guides first: michelin guide (stars, bib gourmand, then michelin-selected), then gambero rosso, 50 best, eater, time out and serious local press. if they name a place, find that exact place. 4 to 6 places, best first, each one real and currently open for business. never invent a place, a rating or a michelin listing: only tag michelin when the michelin guide site lists it.
5. practical: when the request is a practical question about the city (getting around, the airport, money, tipping, safety, apps, sim cards, what's open when, neighborhoods to stay in), answer it in "tip": two or three short lowercase sentences, specific and current, checked with web search. no em dashes. otherwise "tip" is null.
6. answer with only this json, no prose around it:
{"reply": "one short lowercase line for the person, no em dashes. when there's no exact match say so plainly and point at the near ones, like: no runs this week, but these get you moving", "picks": [listed event ids that fit, best first], "near": [listed event ids that are close, best first], "found": [{"title": "", "starts_at": "iso 8601 with timezone offset", "ends_at": "iso 8601 or null", "venue": "", "address": "", "url": "page you found it on"}], "places": [{"name": "", "area": "neighborhood", "kind": "trattoria, cocktail bar, ...", "why": "one short lowercase line in our voice: what to order or why locals go", "price": "$ to $$$$", "michelin": "star | bib | guide | null", "url": "the guide or official page you found it on"}], "tip": "practical answer or null"}`

const pickJson = (text) => {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

// the place's own photo, rating and maps link from google (the photo url google
// hands back carries no key)
async function enrich(p, place) {
  const key = process.env.GOOGLE_MAPS_KEY
  if (!key) return p
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": "places.photos,places.rating,places.googleMapsUri,places.userRatingCount" },
      body: JSON.stringify({ textQuery: `${p.name}, ${p.area ? `${p.area}, ` : ""}${place}`, pageSize: 1 }),
      signal: AbortSignal.timeout(5000),
    })
    const g = (await r.json())?.places?.[0]
    if (!g) return p
    let photo = null
    if (g.photos?.[0]?.name) {
      const m = await fetch(`https://places.googleapis.com/v1/${g.photos[0].name}/media?maxWidthPx=700&skipHttpRedirect=true&key=${key}`, { signal: AbortSignal.timeout(4000) }).then((x) => x.json()).catch(() => null)
      photo = m?.photoUri || null
    }
    return { ...p, photo, rating: g.rating || null, reviews: g.userRatingCount || null, maps: g.googleMapsUri || p.maps }
  } catch {
    return p
  }
}

export async function askCity(city, q) {
  const now = Date.now()
  const { data: rows } = await db
    .from("events")
    .select("id, title, category, host, venue, starts_at")
    .eq("city", city)
    .eq("hidden", false)
    .neq("source", "venue")
    .or(`starts_at.gte.${new Date(now - 3 * 3600e3).toISOString()},ends_at.gte.${new Date(now).toISOString()}`)
    .lte("starts_at", new Date(now + DAYS * 864e5).toISOString())
    .order("starts_at")
    .limit(300)
  const listed = (rows || []).map((e) => `${e.id} | ${e.starts_at.slice(0, 16)} | ${e.category} | ${e.title}${e.host ? ` | by ${e.host}` : ""}${e.venue ? ` | ${e.venue}` : ""}`).join("\n")
  // say the country: "palermo" alone could be the buenos aires barrio
  const place = { palermo: "Palermo, Sicily, Italy", medellin: "Medellín, Colombia", miami: "Miami, Florida, USA", "new-york": "New York City, USA", "los-angeles": "Los Angeles, California, USA" }[city] || cityLabel(city)

  let out
  try {
    const messages = [{
      role: "user",
      content: `city: ${place}\n${sourcesFor(city)}\ntoday: ${new Date().toISOString().slice(0, 10)}\nrequest: ${q}\n\nlisted events (id | starts | kind | title):\n${listed || "(none yet)"}`,
    }]
    let msg
    // web search can pause a long turn: hand it back so the server finishes it
    for (let i = 0; i < 3; i++) {
      msg = await client.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
        messages,
      })
      for (const b of msg.content) if (b.type === "web_search_tool_result" && b.content?.error_code) console.error("event search web error:", b.content.error_code)
      if (msg.stop_reason !== "pause_turn") break
      messages.push({ role: "assistant", content: msg.content })
    }
    if (msg.stop_reason === "refusal") return { reply: "can't help with that one. try something else.", ids: [], near: [], places: [], tip: null }
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
    out = pickJson(text)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: 429, error: "too many searches right now. try again in a minute." }
    console.error("event search error:", e?.status, e?.message)
    return { status: 502, error: "search is down for a sec. try again." }
  }
  if (!out) return { reply: "nothing for that exactly. here's what's on soon.", ids: [], near: (rows || []).slice(0, 6).map((e) => e.id), places: [], tip: null }

  const known = new Set((rows || []).map((e) => e.id))
  const ids = (out.picks || []).map(Number).filter((id) => known.has(id))
  const near = (out.near || []).map(Number).filter((id) => known.has(id) && !ids.includes(id))

  // what the web found becomes a real listing: going button, chat, the lot
  const fresh = []
  for (const f of (out.found || []).slice(0, 6)) {
    const t = Date.parse(f.starts_at)
    const end = Date.parse(f.ends_at || "") || t + 3 * 3600e3
    if (!f.title || !t || end < now || t > now + DAYS * 864e5) continue
    if (!/^https?:\/\//.test(String(f.url || ""))) continue
    fresh.push({
      source: "web",
      source_id: crypto.createHash("sha1").update(`${city}|${String(f.title).toLowerCase()}|${new Date(t).toISOString().slice(0, 10)}`).digest("hex").slice(0, 20),
      city,
      title: String(f.title).slice(0, 200),
      starts_at: new Date(t).toISOString(),
      ends_at: Date.parse(f.ends_at || "") ? new Date(Date.parse(f.ends_at)).toISOString() : null,
      venue: f.venue ? String(f.venue).slice(0, 120) : null,
      address: f.address ? String(f.address).slice(0, 200) : null,
      url: String(f.url).slice(0, 500),
      category: kindOf(f.title, q),
      updated_at: new Date().toISOString(),
    })
  }
  if (fresh.length) {
    const { data: saved } = await db.from("events").upsert(fresh, { onConflict: "source,source_id" }).select("id")
    for (const s of saved || []) if (!ids.includes(s.id)) ids.push(s.id)
  }

  // nothing fit and the web came back empty: still show what's on, soonest first
  if (!ids.length && !near.length && !(out.places || []).length) near.push(...(rows || []).slice(0, 6).map((e) => e.id))
  // places to eat and drink, ranked by the guides (michelin first)
  const base = (out.places || []).filter((p) => p?.name && /^https?:\/\//.test(String(p.url || ""))).slice(0, 6).map((p) => ({
    name: String(p.name).slice(0, 80),
    area: String(p.area || "").slice(0, 60),
    kind: String(p.kind || "").slice(0, 40),
    why: String(p.why || "").slice(0, 160),
    price: /^\$+$/.test(String(p.price || "")) ? p.price : null,
    michelin: ["star", "bib", "guide"].includes(p.michelin) ? p.michelin : null,
    url: String(p.url).slice(0, 400),
    maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.area || ""} ${place}`)}`,
  }))
  const places = await Promise.all(base.map((p) => enrich(p, place)))
  const tip = out.tip && String(out.tip).trim().toLowerCase() !== "null" ? String(out.tip).slice(0, 500) : null
  return { reply: String(out.reply || "").slice(0, 200), ids, near, places, tip }
}
