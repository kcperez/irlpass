import Anthropic from "@anthropic-ai/sdk"
import crypto from "crypto"
import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isMod } from "./_mods.js"
import { kindOf } from "./_events.js"

export const config = { api: { bodyParser: { sizeLimit: "4mb" } }, maxDuration: 60 }

// "i saw this on instagram": a member pastes a link or a screenshot of the
// flyer, claude reads out the event, and it's listed with "added by <name>".
// POST { t, city, url?, image? } -> { event id } | { error }
// POST { t, action: "remove", id }  -> whoever added it (or a mod) takes it down
const CATS = ["run", "wellness", "party", "food", "art", "social", "tech"]

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  if (req.body?.action === "remove") {
    const id = Number(req.body?.id)
    const { data: e } = await db.from("events").select("id, submitted_by").eq("id", id).maybeSingle()
    if (!e || (e.submitted_by !== me.memberNo && !isMod(me.memberNo))) return res.status(403).json({ error: "not yours" })
    await db.from("events").update({ hidden: true }).eq("id", id)
    return res.status(200).json({ ok: true })
  }

  const city = String(req.body?.city || me.city || "medellin").slice(0, 40)
  const url = /^https?:\/\/\S+$/.test(String(req.body?.url || "").trim()) ? String(req.body.url).trim().slice(0, 500) : null
  const m = String(req.body?.image || "").match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
  if (!url && !m) return res.status(400).json({ error: "paste a link or add a screenshot" })

  // a few a day each, so nobody floods a city
  const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("submitted_by", me.memberNo).gte("created_at", new Date(Date.now() - 864e5).toISOString())
  if (!isMod(me.memberNo) && count >= 5) return res.status(429).json({ error: "that's 5 today. thank you! more tomorrow." })

  const content = []
  if (m) content.push({ type: "image", source: { type: "base64", media_type: `image/${m[1]}`, data: m[2] } })
  content.push({ type: "text", text: `city: ${city.replace(/-/g, " ")}\ntoday: ${new Date().toISOString().slice(0, 10)}${url ? `\nlink: ${url}` : ""}\nread the event.` })

  let out
  try {
    const msg = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      tools: url ? [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 }, { type: "web_search_20260209", name: "web_search", max_uses: 2 }] : [],
      system: `someone spotted an event (an instagram flyer, a post, a link) and wants it listed in a city guide. read it and pull out the details. if the link can't be opened (instagram often can't), search for the event by what the url and any screenshot show. it must be a real public event in or near the given city with a specific date in the future. the year is the next time that date comes up if the flyer leaves it out. never invent a detail you can't see or find. answer with only json: {"ok": true|false, "why": "short lowercase reason if not ok", "title": "", "starts_at": "iso 8601 with the city's utc offset", "ends_at": "iso or null", "venue": "", "address": "", "price_usd": number or null, "free": true|false|null, "category": "${CATS.join("|")}", "en": "title in english", "es": "title in spanish"}`,
      messages: [{ role: "user", content }],
    })
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("")
    out = JSON.parse((text.match(/\{[\s\S]*\}/) || ["{}"])[0])
  } catch (err) {
    console.error("event submit read failed:", err?.status, err?.message)
    return res.status(502).json({ error: "couldn't read that one. try a screenshot of the flyer." })
  }
  if (!out?.ok) return res.status(422).json({ error: out?.why || "that doesn't look like an upcoming event" })
  const starts = Date.parse(out.starts_at)
  if (!out.title || !starts || starts < Date.now() - 3 * 3600e3) return res.status(422).json({ error: "couldn't find a date that hasn't passed" })

  // already listed? send them to that one instead of a copy
  const day = new Date(starts).toISOString().slice(0, 10)
  const { data: same } = await db.from("events").select("id, title").eq("city", city).gte("starts_at", `${day}T00:00:00Z`).lte("starts_at", `${day}T23:59:59Z`).limit(300)
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30)
  const dupe = (same || []).find((e) => norm(e.title) === norm(out.title))
  if (dupe) return res.status(200).json({ id: dupe.id, already: true })

  const price = Number(out.price_usd)
  const row = {
    source: "member",
    source_id: crypto.createHash("sha1").update(`${city}|${norm(out.title)}|${day}`).digest("hex").slice(0, 20),
    city,
    title: String(out.title).slice(0, 200),
    titles: out.en || out.es ? { en: String(out.en || out.title).slice(0, 200), es: String(out.es || out.title).slice(0, 200) } : null,
    starts_at: new Date(starts).toISOString(),
    ends_at: Date.parse(out.ends_at || "") ? new Date(Date.parse(out.ends_at)).toISOString() : null,
    venue: out.venue ? String(out.venue).slice(0, 120) : null,
    address: out.address ? String(out.address).slice(0, 200) : null,
    url,
    price_cents: price > 0 ? Math.round(price * 100) : null,
    currency: price > 0 ? "usd" : null,
    is_free: typeof out.free === "boolean" ? out.free : price > 0 ? false : null,
    category: CATS.includes(out.category) ? out.category : kindOf(out.title),
    host: null,
    submitted_by: me.memberNo,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await db.from("events").upsert(row, { onConflict: "source,source_id" }).select("id").single()
  if (error) {
    console.error("event submit save failed:", error)
    return res.status(500).json({ error: "couldn't save it. try again." })
  }
  return res.status(200).json({ id: data.id })
}
