import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { today, hasComp } from "./_access.js"
import { actsAsMod } from "./_mods.js"
import { cityLabel } from "./_cities.js"
import { openAt, fmtMin } from "./_hours.js"
import { tonight } from "./mood.js"

// "what should i do right now?" — a flo-style check-in. you say how you
// feel; we already know your city (your dates), the time and roughly where
// you are, and hand back three picks that are open now, close, well reviewed,
// and where other irlpass people are headed. shuffle for three more.
// POST { t, feeling, day, minute, lat?, lng?, seen: [ids or names] }
export const config = { maxDuration: 60 }

export const FEELINGS = {
  hungry: { label: "hungry", match: /restaurant|food|grill|sushi|pizza|bistro|bakery|brunch|steak|taco|burger|kitchen|cocina|asian|peruvian|thai|ramen|market/ },
  coffee: { label: "coffee", match: /cafe|café|coffee|espresso|bakery|tea|pastry/ },
  drinks: { label: "drinks", match: /\bbar\b|pub|cocktail|wine|rooftop|brew|lounge/, moods: ["pregame"], night: true },
  dance: { label: "dance", match: /night ?club|disco|dance|salsa|reggaeton/, moods: ["afters"], night: true },
  sweat: { label: "sweat", match: /gym|yoga|fitness|crossfit|pilates|climb|boxing/, tag: "recovery" },
  recover: { label: "recover", match: /juice|brunch|spa|sauna|healthy|cafe|coffee|market|smoothie|açaí|acai/, tag: "recovery" },
  explore: { label: "explore", match: /park|museum|market|garden|view|tour|gallery/ },
  surprise: { label: "surprise me", match: /./ },
}

const km = (a, b) => {
  const r = Math.PI / 180
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r)
  const y = (b.lat - a.lat) * r
  return Math.sqrt(x * x + y * y) * 6371
}
const isMember = (me) => !!me.paid || hasComp(me) || actsAsMod(me)
export const FREE_PER_DAY = 3

async function claude(body) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 900, ...body }),
  })
  if (!r.ok) { console.error("claude", r.status, await r.text().catch(() => "")); return null }
  const d = await r.json()
  const text = (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("")
  const m = text.match(/\{[\s\S]*\}/)
  try { return m ? JSON.parse(m[0]) : null } catch { return null }
}

const VOICE = "write like a friend who lives there: lowercase, plain, specific, max 14 words. no em dashes, no hype words, no 'not x but y'."

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const feeling = FEELINGS[req.body?.feeling] ? req.body.feeling : "surprise"
  const day = Number.isInteger(req.body?.day) ? req.body.day : new Date().getUTCDay()
  const minute = Number.isInteger(req.body?.minute) ? req.body.minute : 12 * 60
  const here = Number.isFinite(req.body?.lat) && Number.isFinite(req.body?.lng) ? { lat: req.body.lat, lng: req.body.lng } : null
  const seen = new Set((Array.isArray(req.body?.seen) ? req.body.seen : []).map(String).slice(0, 60))

  try {
    // where you are: the trip you're on now, else your next one, else home
    const { data: trip } = await db.from("trips").select("city").eq("member_no", me.memberNo).gte("ends", today()).lte("starts", today()).limit(1).maybeSingle()
    const city = trip?.city || me.homeCity || me.city || "medellin"

    // free members get a few check-ins a day; the pass makes it unlimited
    const member = isMember(me)
    const since = new Date(Date.now() - 20 * 3600e3).toISOString()
    const { count: used } = await db.from("now_checks").select("id", { count: "exact", head: true }).eq("member_no", me.memberNo).gte("created_at", since)
    if (!member && (used || 0) >= FREE_PER_DAY) {
      return res.status(402).json({ error: "that's your free picks for today", gate: "shuffle" })
    }

    const f = FEELINGS[feeling]
    const { data: spots } = await db.from("spots").select("*").eq("city", city).eq("active", true)
    const night = tonight()
    const { data: going } = await db.from("spot_going").select("spot_id").eq("night", night)
    const goingCount = {}
    for (const g of going || []) goingCount[g.spot_id] = (goingCount[g.spot_id] || 0) + 1

    let picks = []
    let source = "guide"
    if (spots?.length) {
      const hay = (s) => `${s.category || ""} ${s.kind || ""}`.toLowerCase()
      const fits = (s) => feeling === "surprise" || f.match.test(hay(s)) || (f.moods || []).includes(s.mood) || (f.tag && s.tag === f.tag)
      const scored = spots
        .filter((s) => !seen.has(String(s.id)) && fits(s))
        .map((s) => {
          const o = openAt(s.hours, day, minute)
          const dist = here && s.lat ? km(here, { lat: s.lat, lng: s.lng }) : null
          let score = 0
          if (o.open === false) score -= 100
          // nightlife with no listed hours is a guess we won't make in daylight
          if (o.open === null && f.night && minute >= 360 && minute < 1020) score -= 100
          if (o.open === true) score += 3
          if (o.open && o.until - minute < 45) score -= 2
          score += ((s.rating || 4.3) - 4.3) * 4 + Math.log10((s.reviews || 0) + 1)
          score += (goingCount[s.id] || 0) * 1.5
          if (dist != null) score -= Math.min(dist, 12) * 0.6
          return { s, o, dist, score }
        })
        .filter((x) => x.score > -50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)

      const describe = (x) => ({
        id: x.s.id,
        name: x.s.name,
        area: x.s.area || "",
        category: x.s.category || x.s.kind || "",
        rating: x.s.rating,
        reviews: x.s.reviews,
        openUntil: x.o.open ? fmtMin(x.o.until) : null,
        km: x.dist != null ? Math.round(x.dist * 10) / 10 : null,
        goingTonight: goingCount[x.s.id] || 0,
        note: x.s.blurb || "",
        review: x.s.quote || "",
      })
      const cands = scored.map(describe)

      // claude picks three and says why, in our voice; without a key, the top three
      let chosen = null
      if (cands.length > 3) {
        const out = await claude({
          system: `you pick places for a traveler on irlpass, a social travel app. ${VOICE}`,
          messages: [{
            role: "user",
            content: `it's ${["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day]} ${fmtMin(minute)} in ${cityLabel(city)}. they feel: ${f.label}.${here ? "" : " we don't know exactly where they are."}\ncandidates (json):\n${JSON.stringify(cands)}\n\npick the 3 best for right now. prefer open, close, well reviewed, and places other irlpass people are going. reply only json: {"picks":[{"id":number,"why":"..."}]}`,
          }],
        })
        if (Array.isArray(out?.picks)) chosen = out.picks.filter((p) => cands.some((c) => c.id === p.id)).slice(0, 3)
        if (chosen) source = "claude"
      }
      if (!chosen?.length) chosen = cands.slice(0, 3).map((c) => ({ id: c.id, why: c.note }))

      picks = chosen.map((p) => {
        const x = scored.find((y) => y.s.id === p.id)
        const c = describe(x)
        const facts = [c.openUntil && `open til ${c.openUntil}`, c.rating && `${c.rating}★`, c.km != null && (c.km < 1 ? `${Math.round(c.km * 1000)}m away` : `${c.km}km away`)].filter(Boolean).join(" · ")
        return {
          id: c.id,
          name: c.name,
          area: c.area,
          category: c.category,
          photo: Array.isArray(x.s.photos) ? x.s.photos[0] || null : null,
          why: p.why || c.note || "",
          facts,
          going: c.goingTonight,
          mapsUrl: x.s.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${cityLabel(city)}`)}`,
        }
      })
    }

    // no guide in this city yet (or nothing fits): claude searches the web live
    if (!picks.length) {
      source = "web"
      const out = await claude({
        system: `you find real places for a traveler on irlpass. only suggest places that exist and are likely open at this hour. ${VOICE}`,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{
          role: "user",
          content: `it's ${["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day]} ${fmtMin(minute)} in ${cityLabel(city)}${here ? ` near ${here.lat.toFixed(3)},${here.lng.toFixed(3)}` : ""}. they feel: ${f.label}. skip: ${[...seen].join(", ") || "nothing"}.\nfind 3 well-reviewed places open now. reply only json: {"picks":[{"name":"...","area":"neighborhood","why":"...","rating":4.6}]}`,
        }],
      })
      picks = (out?.picks || []).slice(0, 3).map((p) => ({
        id: null,
        name: String(p.name || "").slice(0, 80),
        area: String(p.area || "").slice(0, 60),
        why: String(p.why || "").slice(0, 160),
        facts: p.rating ? `${p.rating}★` : "",
        photo: null,
        going: 0,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${cityLabel(city)}`)}`,
      })).filter((p) => p.name)
    }

    await db.from("now_checks").insert({ member_no: me.memberNo, feeling, city, picks }).then(() => {}, () => {})
    return res.status(200).json({
      city,
      cityName: cityLabel(city),
      feeling,
      picks,
      source,
      left: member ? null : Math.max(0, FREE_PER_DAY - (used || 0) - 1),
      empty: !picks.length,
    })
  } catch (e) {
    console.error("now error:", e)
    return res.status(500).json({ error: "couldn't find picks right now" })
  }
}
