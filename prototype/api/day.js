import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { today, hasComp } from "./_access.js"
import { actsAsMod } from "./_mods.js"
import { cityLabel } from "./_cities.js"

// "my day": a whole day planned around you, like the lagos page kevin made for
// maria. a timeline (time, emoji, place, one line, a map link in the app people
// actually use there), "pick one" options for some slots, and a link to share.
// it knows where you are and when, what's open, local holidays, and keeps the
// stops close together.
//
// POST { t, wish, vibes: [..], date?, day, minute, lat?, lng?, city? } -> { id, ...plan }
// GET  ?id=  -> a shared plan (no account needed)
export const config = { maxDuration: 120 }

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const FREE_PER_DAY = 1
const km = (a, b) => {
  const r = Math.PI / 180
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r)
  const y = (b.lat - a.lat) * r
  return Math.sqrt(x * x + y * y) * 6371
}
const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
const isMember = (me) => !!me.paid || hasComp(me) || actsAsMod(me)

// the map app people actually use there
function mapUrl(name, area, cityName, country) {
  const q = encodeURIComponent([name, area, cityName].filter(Boolean).join(" "))
  if (country === "KR") return `https://map.naver.com/p/search/${encodeURIComponent([name, cityName].join(" "))}`
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

const newId = () => Array.from({ length: 10 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("")

export default async function handler(req, res) {
  try {
    // a shared plan: anyone with the link can open it
    if (req.method === "GET") {
      const id = String(req.query?.id || "").slice(0, 20)
      const { data } = await db.from("day_plans").select("id, city, city_name, date, wish, stops, created_at").eq("id", id).maybeSingle()
      if (!data) return res.status(404).json({ error: "that plan is gone" })
      res.setHeader("cache-control", "public, max-age=60")
      return res.status(200).json({ id: data.id, city: data.city, cityName: data.city_name, date: data.date, wish: data.wish, ...(data.stops || {}) })
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })

    const me = await getUser(req.body?.t)
    if (!me) return res.status(401).json({ error: "not a member" })
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return res.status(503).json({ error: "plans aren't on yet" })

    // free: one planned day a day. the pass: as many as you want
    const member = isMember(me)
    const since = new Date(Date.now() - 20 * 3600e3).toISOString()
    const { count: used } = await db.from("day_plans").select("id", { count: "exact", head: true }).eq("member_no", me.memberNo).gte("created_at", since)
    if (!member && (used || 0) >= FREE_PER_DAY) return res.status(402).json({ error: "that's your free plan for today", gate: "day" })

    const here = Number.isFinite(req.body?.lat) && Number.isFinite(req.body?.lng) ? { lat: req.body.lat, lng: req.body.lng } : null
    const day = Number.isInteger(req.body?.day) ? req.body.day : new Date().getUTCDay()
    const minute = Number.isInteger(req.body?.minute) ? req.body.minute : 600
    const wish = String(req.body?.wish || "").trim().slice(0, 300)
    const vibes = (Array.isArray(req.body?.vibes) ? req.body.vibes : []).map(String).slice(0, 6)
    const forDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || "") ? req.body.date : null
    // the phone's own date, so "today" is today where they are
    const localDay = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.today || "") ? req.body.today : today()

    // where: a trip city they picked, else the phone, else the trip they're on, else home
    const { data: trips } = await db.from("trips").select("city, starts, ends").eq("member_no", me.memberNo).gte("ends", today()).eq("hidden", false).order("starts")
    const chosen = req.body?.city ? (trips || []).find((tr) => tr.city === req.body.city) : null
    const current = (trips || []).find((tr) => tr.starts <= today())
    let city = chosen?.city || current?.city || me.homeCity || me.city || "medellin"
    let cityName = cityLabel(city)
    if (!chosen && here) {
      const { data: known } = await db.from("cities").select("slug, name, lat, lng").not("lat", "is", null)
      const near = (known || []).map((c) => ({ c, d: km(here, c) })).sort((a, b) => a.d - b.d)[0]
      if (near && near.d < 25) { city = near.c.slug; cityName = near.c.name }
      else {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${here.lat}&lon=${here.lng}`, { headers: { "user-agent": "irlpass/1.0 (hello@irlpass.xyz)" } }).catch(() => null)
        const a = r?.ok ? (await r.json().catch(() => ({})))?.address || {} : {}
        cityName = a.city || a.town || a.state || a.country || cityName
        city = cityName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 40)
      }
    }

    // our verified spots there, so the plan leans on places we know are real
    const { data: spots } = await db.from("spots").select("name, area, category, rating, blurb").eq("city", city).eq("active", true).limit(80)
    const guide = (spots || []).map((s) => `${s.name} (${s.area || ""}${s.category ? `, ${s.category}` : ""}${s.rating ? `, ${s.rating}★` : ""})`).join("; ")

    const when = forDate
      ? `the plan is for ${new Date(`${forDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}, starting around 10:00`
      : `it's ${DAYS[day]} ${fmt(minute)} now; plan the rest of today starting in about 30 minutes`
    const prompt = `you're planning a day for someone on irlpass (a social travel app, mostly people 22-35) in ${cityName}${here && !chosen ? ` (near ${here.lat.toFixed(3)},${here.lng.toFixed(3)})` : ""}.
${when}.
what they want: ${wish || "a great day, surprise them"}${vibes.length ? ` · vibe: ${vibes.join(", ")}` : ""}.
${guide ? `places we've verified there (prefer these when they fit): ${guide}` : ""}

search the web to check: real places, opening hours on that day, and any public holiday or closures in that country on that date (say so in the intro if there is one).
rules: 5-7 stops, in a sensible order with short travel between them, meals at normal times, every place open at its time slot. 1-3 of the stops can offer 2 alternatives (a "pick one").
voice: a friend who lives there. lowercase, playful, specific, short. no em dashes, no hype words.

reply only json:
{"country":"two-letter code","title":"max 6 words","intro":"one line, mention a holiday if relevant","stops":[{"time":"HH:MM","emoji":"one emoji","name":"exact place name","area":"neighborhood","line":"max 12 words, why go","tip":"max 10 words, practical","alts":[{"emoji":"","name":"","area":"","line":""}]}]}`

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!r.ok) throw new Error(`claude ${r.status}`)
    const d = await r.json()
    const texts = (d.content || []).filter((c) => c.type === "text").map((c) => c.text)
    let plan = null
    for (const tx of [texts.join(""), ...texts.reverse()]) {
      const m = tx.match(/\{[\s\S]*"stops"[\s\S]*\}/)
      try { plan = m ? JSON.parse(m[0]) : null } catch { plan = null }
      if (plan?.stops?.length) break
    }
    if (!plan?.stops?.length) throw new Error("no plan")

    const country = String(plan.country || "").toUpperCase().slice(0, 2)
    const clean = (s) => ({
      emoji: String(s.emoji || "📍").slice(0, 4),
      name: String(s.name || "").slice(0, 80),
      area: String(s.area || "").slice(0, 60),
      line: String(s.line || "").slice(0, 140),
      tip: String(s.tip || "").slice(0, 100),
    })
    const stops = plan.stops.slice(0, 8).map((s) => {
      const c = clean(s)
      return {
        time: /^\d{1,2}:\d{2}$/.test(s.time || "") ? s.time : "",
        ...c,
        mapUrl: mapUrl(c.name, c.area, cityName, country),
        alts: (Array.isArray(s.alts) ? s.alts : []).slice(0, 2).map(clean).filter((a) => a.name).map((a) => ({ ...a, mapUrl: mapUrl(a.name, a.area, cityName, country) })),
      }
    }).filter((s) => s.name)

    const id = newId()
    const out = { title: String(plan.title || "your day").slice(0, 60), intro: String(plan.intro || "").slice(0, 200), country, stops }
    await db.from("day_plans").insert({ id, member_no: me.memberNo, city, city_name: cityName, date: forDate || localDay, wish: wish || null, stops: out })
    return res.status(200).json({ id, city, cityName, date: forDate || localDay, ...out, left: member ? null : 0 })
  } catch (e) {
    console.error("day error:", e)
    return res.status(500).json({ error: "couldn't plan that right now. try again in a bit" })
  }
}
