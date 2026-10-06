import { waitUntil } from "@vercel/functions"
import { getUser, safeFirstName, lockedPhoto } from "./_lib.js"
import { db } from "./_db.js"
import { today, hasComp } from "./_access.js"
import { actsAsMod } from "./_mods.js"
import { cityLabel } from "./_cities.js"
import { openAt, fmtMin } from "./_hours.js"
import { tonight } from "./mood.js"
import { quickPhotos } from "./_guide.js"

// "what should i do right now?" — a flo-style check-in. you say how you feel;
// we already know where you are (your phone, else your dates), the day and the
// time, and hand back a short curated list: six options, each with a reason to
// be on it (best right now, closest, where irlpass is going, a hidden gem...).
//
// anywhere in the world: cities with a guide rank our verified spots; anywhere
// else claude searches the web live, and every place it finds gets saved and
// filled in from google, so each city's guide builds itself as people use it.
//
// POST { t, feeling, day, minute, lat?, lng?, seen: [ids or names], city? (a trip city, to plan ahead) }
export const config = { maxDuration: 60 }

export const FEELINGS = {
  hungry: { label: "hungry", mood: "pregame", match: /restaurant|food|grill|sushi|pizza|bistro|bakery|brunch|steak|taco|burger|kitchen|cocina|asian|peruvian|thai|ramen|market|hawker|noodle/ },
  coffee: { label: "coffee", mood: "chill", match: /cafe|café|coffee|espresso|bakery|tea|pastry/ },
  drinks: { label: "drinks", mood: "pregame", match: /\bbar\b|pub|cocktail|wine|rooftop|brew|lounge/, moods: ["pregame"], night: true },
  dance: { label: "dance", mood: "afters", match: /night ?club|disco|dance|salsa|reggaeton/, moods: ["afters"], night: true },
  sweat: { label: "sweat", mood: "chill", match: /gym|yoga|fitness|crossfit|pilates|climb|boxing/, tag: "recovery" },
  recover: { label: "recover", mood: "chill", match: /juice|brunch|spa|sauna|healthy|cafe|coffee|market|smoothie|açaí|acai/, tag: "recovery" },
  explore: { label: "explore", mood: "chill", match: /park|museum|market|garden|view|tour|gallery|temple|beach/ },
  surprise: { label: "surprise me", mood: "chill", match: /./ },
}

// the slots that make a list feel curated instead of "top results"
const SLOTS = ["best right now", "closest", "where irlpass is going", "hidden gem", "cheap and good", "something different"]
const PICKS = 6

const km = (a, b) => {
  const r = Math.PI / 180
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r)
  const y = (b.lat - a.lat) * r
  return Math.sqrt(x * x + y * y) * 6371
}
const isMember = (me) => !!me.paid || hasComp(me) || actsAsMod(me)
export const FREE_PER_DAY = 3
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const norm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

// haiku for speed (a shuffle should feel like a spin, not a wait)
async function claude(body, model = "claude-haiku-4-5-20251001") {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1600, ...body }),
  })
  if (!r.ok) { console.error("claude", r.status, await r.text().catch(() => "")); return null }
  const d = await r.json()
  const text = (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("")
  const m = text.match(/\{[\s\S]*\}/)
  try { return m ? JSON.parse(m[0]) : null } catch { return null }
}

// fun and useful, never fluff: the one thing that makes it worth going, said
// like a friend who's been, plus a tip you'd actually use
const VOICE = "voice: a friend who lives there texting you. lowercase, a little playful, specific (the dish, the view, the crowd, the song), to the point. why: max 12 words. tip: max 10 words, practical (what to order, where to sit, when it fills up). no em dashes, no hype words like amazing/vibrant/hidden gem, no 'not x but y'."

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const feeling = FEELINGS[req.body?.feeling] ? req.body.feeling : "surprise"
  const f = FEELINGS[feeling]
  const day = Number.isInteger(req.body?.day) ? req.body.day : new Date().getUTCDay()
  const minute = Number.isInteger(req.body?.minute) ? req.body.minute : 12 * 60
  const here = Number.isFinite(req.body?.lat) && Number.isFinite(req.body?.lng) ? { lat: req.body.lat, lng: req.body.lng } : null
  const seen = new Set((Array.isArray(req.body?.seen) ? req.body.seen : []).map((x) => norm(x)).slice(0, 80))

  try {
    // where: a trip city you're planning ahead for, else your phone's location,
    // else the trip you're on, else home. (dates can say medellín while you're
    // actually in singapore: the phone wins.)
    const { data: trips } = await db.from("trips").select("city, starts, ends").eq("member_no", me.memberNo).gte("ends", today()).eq("hidden", false).order("starts")
    const current = (trips || []).find((tr) => tr.starts <= today())
    // they picked one of their trip cities: there now (no distances, the phone is
    // elsewhere) or planning ahead if that trip hasn't started
    const chosen = req.body?.city ? (trips || []).find((tr) => tr.city === req.body.city) : null
    const aheadTrip = chosen && chosen.starts > today() ? chosen : null
    let city = current?.city || me.homeCity || me.city || "medellin"
    let cityName = cityLabel(city)
    let useHere = here
    if (chosen) {
      city = chosen.city
      cityName = cityLabel(city)
      useHere = null
    } else if (here) {
      const { data: known } = await db.from("cities").select("slug, name, lat, lng").not("lat", "is", null)
      const near = (known || []).map((c) => ({ c, d: km(here, c) })).sort((a, b) => a.d - b.d)[0]
      if (near && near.d < 80) {
        city = near.c.slug
        cityName = near.c.name
      } else {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${here.lat}&lon=${here.lng}`, { headers: { "user-agent": "irlpass/1.0 (hello@irlpass.xyz)" } }).catch(() => null)
        const a = r?.ok ? (await r.json().catch(() => ({})))?.address || {} : {}
        cityName = a.city || a.town || a.state || a.country || "where you are"
        city = cityName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 40)
      }
    }
    const when = aheadTrip
      ? `they arrive ${new Date(`${aheadTrip.starts}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()} and are planning ahead, so suggest places worth it during their stay`
      : `it's ${DAYS[day]} ${fmtMin(minute)} where they are`

    // free members get a few check-ins a day; the pass makes it unlimited
    const member = isMember(me)
    const since = new Date(Date.now() - 20 * 3600e3).toISOString()
    const { count: used } = await db.from("now_checks").select("id", { count: "exact", head: true }).eq("member_no", me.memberNo).gte("created_at", since)
    if (!member && (used || 0) >= FREE_PER_DAY) {
      return res.status(402).json({ error: "that's your free picks for today", gate: "shuffle" })
    }

    const [{ data: spots }, { data: going }] = await Promise.all([
      db.from("spots").select("*").eq("city", city).eq("active", true),
      db.from("spot_going").select("spot_id").eq("night", tonight()),
    ])
    const goingCount = {}
    for (const g of going || []) goingCount[g.spot_id] = (goingCount[g.spot_id] || 0) + 1

    // 1. our guide: verified spots that fit, open, close, rated, with people going
    const hay = (s) => `${s.category || ""} ${s.kind || ""}`.toLowerCase()
    const fits = (s) => feeling === "surprise" || f.match.test(hay(s)) || (f.moods || []).includes(s.mood) || (f.tag && s.tag === f.tag)
    const scored = (spots || [])
      .filter((s) => !seen.has(norm(s.id)) && !seen.has(norm(s.name)) && fits(s))
      .map((s) => {
        const o = aheadTrip ? { open: null } : openAt(s.hours, day, minute)
        const dist = useHere && s.lat ? km(useHere, { lat: s.lat, lng: s.lng }) : null
        let score = 0
        if (o.open === false) score -= 100
        // nightlife with no listed hours is a guess we won't make in daylight
        if (!aheadTrip && o.open === null && f.night && minute >= 360 && minute < 1020) score -= 100
        if (o.open === true) score += 3
        if (o.open && o.until - minute < 45) score -= 2
        score += ((s.rating || 4.3) - 4.3) * 4 + Math.log10((s.reviews || 0) + 1)
        score += (goingCount[s.id] || 0) * 1.5
        if (dist != null) score -= Math.min(dist, 12) * 0.6
        return { s, o, dist, score }
      })
      .filter((x) => x.score > -50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 16)

    const cands = scored.map((x) => ({
      id: x.s.id,
      name: x.s.name,
      area: x.s.area || "",
      category: x.s.category || x.s.kind || "",
      rating: x.s.rating,
      reviews: x.s.reviews,
      price: x.s.price || "",
      openUntil: x.o.open ? fmtMin(x.o.until) : null,
      km: x.dist != null ? Math.round(x.dist * 10) / 10 : null,
      goingTonight: goingCount[x.s.id] || 0,
      note: x.s.blurb || "",
      review: x.s.quote || "",
    }))
    const card = (c, x, slot, why, tip) => ({
      tip: tip || "",
      quote: x.s.quote || "",
      address: x.s.address || "",
      hoursToday: (Array.isArray(x.s.hours) ? x.s.hours : []).find((h) => h.day?.toLowerCase() === DAYS[day])?.hours || "",
      id: city === "medellin" ? c.id : null,
      ref: c.id,
      name: c.name,
      area: c.area,
      category: c.category,
      label: slot,
      photo: Array.isArray(x.s.photos) ? x.s.photos[0] || null : null,
      why: why || c.note || "",
      facts: [c.openUntil && `open til ${c.openUntil}`, c.rating && `${c.rating}★`, c.price, c.km != null && (c.km < 1 ? `${Math.round(c.km * 1000)}m away` : `${c.km}km away`)].filter(Boolean).join(" · "),
      going: c.goingTonight,
      mapsUrl: x.s.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${cityName}`)}`,
    })

    let picks = []
    let source = "guide"
    if (cands.length >= 4) {
      const out = await claude({
        system: `you curate a short list of places for a traveler on irlpass, a social travel app. ${VOICE}`,
        messages: [{
          role: "user",
          content: `${when} in ${cityName}. they feel: ${f.label}.${useHere || aheadTrip ? "" : " we don't know exactly where they are."}\ncandidates (json):\n${JSON.stringify(cands)}\n\nmake a list of up to ${PICKS}, each a different reason to go, using these labels once each when they fit: ${SLOTS.join(", ")}. prefer open now, close, well reviewed, and places other irlpass people are going. reply only json: {"picks":[{"id":number,"label":"...","why":"...","tip":"..."}]}`,
        }],
      })
      const chosen = (Array.isArray(out?.picks) ? out.picks : []).filter((p, i, a) => cands.some((c) => c.id === p.id) && a.findIndex((q) => q.id === p.id) === i).slice(0, PICKS)
      if (chosen.length) {
        source = "claude"
        // a label has to be true: "where irlpass is going" needs people going,
        // "closest" needs a distance
        const honest = (label, c) =>
          !SLOTS.includes(label) ? "" :
          label === "where irlpass is going" && !c.goingTonight ? "local favorite" :
          label === "closest" && c.km == null ? "" : label
        picks = chosen.map((p) => {
          const c = cands.find((x) => x.id === p.id)
          return card(c, scored.find((x) => x.s.id === p.id), honest(p.label, c), p.why, p.tip)
        })
      } else {
        // no claude: fill the slots by rule
        const used = new Set()
        const take = (slot, pickFn) => {
          const x = pickFn(cands.filter((c) => !used.has(c.id)))
          if (!x) return
          used.add(x.id)
          picks.push(card(x, scored.find((y) => y.s.id === x.id), slot))
        }
        take("best right now", (l) => l[0])
        take("closest", (l) => l.filter((c) => c.km != null).sort((a, b) => a.km - b.km)[0])
        take("where irlpass is going", (l) => l.filter((c) => c.goingTonight).sort((a, b) => b.goingTonight - a.goingTonight)[0])
        take("hidden gem", (l) => l.filter((c) => (c.rating || 0) >= 4.6 && (c.reviews || 0) < 400)[0])
        take("cheap and good", (l) => l.filter((c) => /^\${1,2}$|cop ?[0-9]{1,2}[.,]/i.test(c.price || ""))[0])
        while (picks.length < PICKS && cands.some((c) => !used.has(c.id))) take("", (l) => l[0])
      }
    }

    // 2. not enough in our guide here: claude searches the web live, and what it
    // finds is saved so this city's guide grows (photos and hours fill in from google)
    if (picks.length < 4) {
      const out = await claude({
        system: `you curate real places for a traveler on irlpass. only suggest places that exist${aheadTrip ? "" : " and are open at this hour"}. ${VOICE}`,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
        messages: [{
          role: "user",
          content: `${when} in ${cityName}${useHere ? ` near ${useHere.lat.toFixed(3)},${useHere.lng.toFixed(3)}` : ""}. they feel: ${f.label}. skip: ${[...seen].join(", ") || "nothing"}${picks.length ? `, ${picks.map((p) => p.name).join(", ")}` : ""}.\nfind ${PICKS - picks.length} well-reviewed places, each a different reason to go, using these labels once each when they fit: ${SLOTS.filter((s) => s !== "where irlpass is going").join(", ")}. reply only json: {"picks":[{"name":"...","area":"neighborhood","label":"...","why":"...","tip":"...","rating":4.6,"price":"$$"}]}`,
        }],
      })
      const web = (out?.picks || [])
        .filter((p) => p?.name && !seen.has(norm(p.name)) && !picks.some((q) => norm(q.name) === norm(p.name)))
        .slice(0, PICKS - picks.length)
      if (web.length) source = picks.length ? "guide+web" : "web"

      // save them into this city's guide (once per name), then fill in from google in the background
      const saved = []
      if (web.length) {
        const { data: have } = await db.from("spots").select("id, name, photos").eq("city", city)
        const byName = new Map((have || []).map((s) => [norm(s.name), s.id]))
        const hasPhoto = new Map((have || []).map((s) => [s.id, Array.isArray(s.photos) && s.photos.length > 0 ? s.photos[0] : null]))
        for (const p of web) {
          let id = byName.get(norm(p.name))
          if (id && !hasPhoto.get(id)) saved.push({ id, q: `${p.name}, ${p.area || ""}, ${cityName}` })
          if (!id) {
            const { data: made } = await db.from("spots").insert({
              city,
              mood: f.mood,
              name: String(p.name).slice(0, 60),
              area: String(p.area || "").toLowerCase().slice(0, 40) || null,
              kind: f.label,
              blurb: String(p.why || "").slice(0, 200) || null,
              sort: 950,
              added_by: "ai",
            }).select("id").single().then((r) => r, () => ({ data: null }))
            id = made?.id
            if (id) saved.push({ id, q: `${p.name}, ${p.area || ""}, ${cityName}` })
          }
          picks.push({
            id: city === "medellin" ? id || null : null,
            ref: id || null,
            name: String(p.name).slice(0, 80),
            area: String(p.area || "").slice(0, 60),
            category: "",
            label: SLOTS.includes(p.label) && p.label !== "where irlpass is going" ? p.label : "",
            photo: (id && hasPhoto.get(id)) || null,
            why: String(p.why || "").slice(0, 160),
            tip: String(p.tip || "").slice(0, 120),
            facts: [p.rating && `${p.rating}★`, p.price].filter(Boolean).join(" · "),
            going: 0,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${cityName}`)}`,
          })
        }
      }
      // photos for all of them in one scraper run; the app polls and fades them in
      if (saved.length) waitUntil(quickPhotos(saved.slice(0, PICKS)).catch((e) => console.error("photos:", e)))
    }

    await db.from("now_checks").insert({ member_no: me.memberNo, feeling, city, picks }).then(() => {}, () => {})

    // the social part: who else here feels the same in the last few hours
    // (that's a plan waiting to happen), and your check-in streak
    const [{ data: same }, { data: mine }] = await Promise.all([
      db.from("now_checks").select("member_no").eq("city", city).eq("feeling", feeling).neq("member_no", me.memberNo).gte("created_at", new Date(Date.now() - 3 * 3600e3).toISOString()).lt("member_no", "900"),
      db.from("now_checks").select("created_at").eq("member_no", me.memberNo).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    ])
    const otherNos = [...new Set((same || []).map((x) => x.member_no))].slice(0, 12)
    const { data: rows } = otherNos.length ? await db.from("members").select("member_no, name, photo_url, banned").in("member_no", otherNos) : { data: [] }
    const others = (rows || []).filter((r) => !r.banned).map((r) => ({ memberNo: r.member_no, first: safeFirstName(r.name, ""), photo: lockedPhoto(r.photo_url) }))
    const days = new Set((mine || []).map((x) => x.created_at.slice(0, 10)))
    let streak = 0
    for (let d = new Date(); days.has(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) streak++

    // upcoming trips, so the app can offer "plan ahead for lisbon"
    // every city they could shuffle: their trips (current first, then upcoming)
    const seenCity = new Set()
    const ahead = (trips || [])
      .filter((tr) => !seenCity.has(tr.city) && seenCity.add(tr.city))
      .slice(0, 5)
      .map((tr) => ({ city: tr.city, name: cityLabel(tr.city), starts: tr.starts, now: tr.starts <= today() }))

    return res.status(200).json({
      city,
      cityName,
      planningAhead: !!aheadTrip,
      chosenCity: chosen?.city || null,
      feeling,
      picks,
      source,
      left: member ? null : Math.max(0, FREE_PER_DAY - (used || 0) - 1),
      others,
      streak,
      ahead,
      empty: !picks.length,
    })
  } catch (e) {
    console.error("now error:", e)
    return res.status(500).json({ error: "couldn't find picks right now" })
  }
}
