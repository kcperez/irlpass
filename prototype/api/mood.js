import { getUser, lockedPhoto, safeFirstName, rowToMember } from "./_lib.js"
import { db } from "./_db.js"
import { canReach, today } from "./_access.js"
import { actsAsMod } from "./_mods.js"
import { waitUntil } from "@vercel/functions"
import { enrichSpots, googleSearch } from "./_guide.js"
import { notifyMemberNo } from "./_notify.js"
import { openAt, fmtMin } from "./_hours.js"

// the mood tab (josh's EDC sprint): pick tonight's mood, see the hand-picked
// spots for it, tap "i'm going tonight", see who else is going, and drop an
// "i'm out in [neighborhood]" status that expires.
//
// GET  ?t=&city=               -> { mood, board: {pregame, afters, chill}, going, presence }
// POST { t, action: "mood", mood }
// POST { t, action: "going", spotId, on }
// POST { t, action: "out", area } | { t, action: "out", off: true }
// POST { t, action: "spot", ... }  (mods: add / edit / hide a spot)
// GET  ?t=&search=             -> any venue in town (openstreetmap), for when it's not on the board
// POST { t, action: "add", place, mood } -> add that venue and mark yourself going

export const MOODS = ["pregame", "afters", "chill"]

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// "til 9pm", "til midnight" or "all night": every out status ends by 6am
// medellín time, so nobody still looks out the next afternoon
const MDE = -5 * 3600e3
function outUntil(choice) {
  const nowLocal = new Date(Date.now() + MDE)
  const at = (h) => {
    const d = new Date(nowLocal)
    d.setUTCHours(h, 0, 0, 0)
    if (d <= nowLocal) d.setUTCDate(d.getUTCDate() + 1)
    return new Date(d.getTime() - MDE)
  }
  const sixAm = at(6)
  const pick = { "9pm": at(21), midnight: at(24 % 24), late: sixAm }[choice] || new Date(Date.now() + 4 * 3600e3)
  return pick > sixAm ? sixAm : pick
}
const fmtUntil = (d) => {
  const h = new Date(d.getTime() + MDE).getUTCHours()
  if (h === 0) return "midnight"
  if (h === 6) return "late"
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`
}

// "tonight" runs until 6am medellín time, so an afters crowd at 2am is still tonight
export const tonight = () => {
  const now = new Date(Date.now() - 5 * 3600e3 - 6 * 3600e3) // utc-5, then back 6h
  return now.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  // plans can be for tonight or any night in the next two weeks
  const tn = tonight()
  const asked = String((req.method === "GET" ? req.query?.night : req.body?.night) || "")
  const night = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= tn && asked <= addDays(tn, 14) ? asked : tn
  const when = night === tn ? "tonight" : `on ${new Date(`${night}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase()}`

  try {
    // the slow, complete search: google maps itself (~20s). for spots the map
    // data doesn't have, or a pasted google maps link
    if (req.method === "GET" && req.query?.google) {
      const out = await googleSearch(String(req.query.google))
      if (out.error) return res.status(502).json({ error: "google maps search isn't available right now" })
      return res.status(200).json({ places: out.places.map((p) => ({ ...p, mood: moodFor(guessKind(p.kind)) })) })
    }

    if (req.method === "GET" && req.query?.search) {
      return res.status(200).json({ places: await searchPlaces(String(req.query.search)) })
    }

    if (req.method === "GET") {
      const city = String(req.query?.city || "medellin")
      // partner venues (they pay, members get a perk for showing up + posting)
      // pro venues also post what's on and link their own booking page
      const { data: partners } = await db.from("venues").select("slug, spot_id, perk, story_perk, booking_url, founding").eq("city", city).eq("status", "active").not("spot_id", "is", null)
      const slugs = (partners || []).map((v) => v.slug)
      const { data: vposts } = slugs.length
        ? await db.from("venue_posts").select("id, venue_slug, title, body, day, ends_on").in("venue_slug", slugs).gte("ends_on", night).order("created_at", { ascending: false })
        : { data: [] }
      const postsBy = {}
      for (const p of vposts || []) if (!p.day || p.day === night) (postsBy[p.venue_slug] = postsBy[p.venue_slug] || []).push({ id: p.id, title: p.title, body: p.body, day: p.day })
      const perkBySpot = Object.fromEntries((partners || []).map((v) => [v.spot_id, {
        slug: v.slug, perk: v.perk, story: v.story_perk || null, booking: v.booking_url || null, founding: !!v.founding, posts: postsBy[v.slug] || [],
      }]))
      const [{ data: spots }, { data: going }, { data: myMood }, { data: out }, access, { data: threads }, { data: roomMsgs }, { count: myTripsHere }] = await Promise.all([
        db.from("spots").select("*").eq("city", city).eq("active", true).order("sort").order("id"),
        db.from("spot_going").select("spot_id, member_no").eq("night", night),
        db.from("moods").select("mood").eq("member_no", me.memberNo).eq("night", night).maybeSingle(),
        db.from("presence").select("*").eq("city", city).gt("expires_at", new Date().toISOString()),
        canReach(me, city, night, night),
        db.from("dm_threads").select("a_no, b_no").or(`a_no.eq.${me.memberNo},b_no.eq.${me.memberNo}`),
        // which plans have a live group chat this night
        db.from("messages").select("channel").like("channel", `spot-%-${night.replace(/-/g, "")}`).eq("deleted", false),
        // give to get: your own dates here let you see faces
        db.from("trips").select("id", { count: "exact", head: true }).eq("member_no", me.memberNo).eq("city", city).gte("ends", today()),
      ])
      const myDatesHere = (myTripsHere || 0) > 0
      const chatCount = {}
      for (const m of roomMsgs || []) {
        const id = Number(m.channel.split("-")[1])
        chatCount[id] = (chatCount[id] || 0) + 1
      }

      // everyone we need to draw: people going somewhere tonight + people out
      const nos = [...new Set([...(going || []).map((g) => g.member_no), ...(out || []).map((p) => p.member_no)])]
      const { data: rows } = nos.length ? await db.from("members").select("*").in("member_no", nos) : { data: [] }
      const byNo = new Map((rows || []).map((r) => [r.member_no, rowToMember(r)]).filter(([, m]) => m && !m.banned))

      // tonight is a shared plan, so the same rules as dates: people you've
      // talked to or can reach are in the clear, everyone else is a preview
      const known = new Set((threads || []).map((t) => (t.a_no === me.memberNo ? t.b_no : t.a_no)))
      const mineSet = new Set((me.interests || []).map((x) => String(x).toLowerCase()))
      const face = (no) => {
        const m = byNo.get(no)
        if (!m) return null
        const open = no === me.memberNo || access.ok || known.has(no) || actsAsMod(me)
        const faceOpen = open || (myDatesHere && !m.hidePhoto && !(me.gender === "man" && m.allowDmFromMen === false))
        return {
          memberNo: no,
          faceOpen,
          first: open ? String(m.name || "").split(/\s+/)[0] : safeFirstName(m.name, m.ig),
          name: open ? m.name : null,
          photo: faceOpen ? m.photo : lockedPhoto(m.photo),
          locked: !open,
          me: no === me.memberNo,
          outNow: (out || []).some((o) => o.member_no === no),
          country: m.country || null,
          shared: (m.interests || []).filter((x) => mineSet.has(String(x).toLowerCase())).slice(0, 3),
        }
      }

      const goingBySpot = {}
      for (const g of going || []) (goingBySpot[g.spot_id] = goingBySpot[g.spot_id] || []).push(g.member_no)

      // what's open right now in medellín (utc-5): at 3am a closed bar is useless
      const local = new Date(Date.now() - 5 * 3600e3)
      const nowDay = local.getUTCDay()
      const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes()
      const board = Object.fromEntries(MOODS.map((mood) => [mood, []]))
      for (const s of spots || []) {
        if (!board[s.mood]) continue
        // a spot someone added from search shows while somebody's going to it
        if (s.added_by && !goingBySpot[s.id] && !actsAsMod(me)) continue
        const people = (goingBySpot[s.id] || []).map(face).filter(Boolean)
          .sort((a, b) => b.me - a.me || b.shared.length - a.shared.length)
        board[s.mood].push({
          id: s.id,
          name: s.name,
          area: s.area || "",
          kind: s.kind || "",
          tag: s.tag || "",
          // the guide: real listing data + our own note
          photos: Array.isArray(s.photos) ? s.photos : [],
          rating: s.rating,
          reviews: s.reviews,
          price: s.price || "",
          category: s.category || "",
          address: s.address || "",
          hours: Array.isArray(s.hours) ? s.hours : [],
          mapsUrl: s.maps_url || "",
          website: s.website || "",
          blurb: s.blurb || "",
          quote: s.quote || "",
          // only other people count; you see "you're going" instead of "1 going"
          going: people.filter((p) => !p.me).length,
          people: people.slice(0, 8),
          imGoing: people.some((p) => p.me),
          ...(night === tn ? (() => {
            const o = openAt(s.hours, nowDay, nowMin)
            return { openNow: o.open, openUntil: o.open ? fmtMin(o.until) : null }
          })() : {}),
          added: !!s.added_by,
          partner: perkBySpot[s.id] || null,
          mood: s.mood,
          room: `spot-${s.id}-${night.replace(/-/g, "")}`,
          chat: chatCount[s.id] || 0,
        })
      }

      for (const m of MOODS) {
        board[m] = board[m]
          .map((x, i) => ({ x, i }))
          // one rule everywhere: live plans first (people going or a group
          // chat going), then the most active, then the guide's own order
          .sort((a, b) =>
            // tonight: closed spots sink to the bottom, whatever else is going on
            (a.x.openNow === false) - (b.x.openNow === false) ||
            !!b.x.partner - !!a.x.partner ||
            (b.x.going > 0 || b.x.chat > 0 || b.x.imGoing) - (a.x.going > 0 || a.x.chat > 0 || a.x.imGoing) ||
            b.x.going * 3 + b.x.chat - (a.x.going * 3 + a.x.chat) ||
            a.i - b.i)
          .map(({ x }) => x)
      }

      return res.status(200).json({
        night,
        tonight: tn,
        mood: myMood?.mood || null,
        board,
        presence: (out || []).map((p) => ({ ...face(p.member_no), area: p.area, until: p.expires_at })).filter((p) => p.memberNo),
        myOut: (out || []).find((p) => p.member_no === me.memberNo) || null,
      })
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const { action } = req.body || {}

    if (action === "mood") {
      const mood = String(req.body?.mood || "")
      if (!MOODS.includes(mood)) return res.status(400).json({ error: "pick a mood" })
      await db.from("moods").upsert(
        { member_no: me.memberNo, night, mood, city: "medellin", updated_at: new Date().toISOString() },
        { onConflict: "member_no,night" }
      )
      return res.status(200).json({ ok: true, mood })
    }

    if (action === "add") {
      const place = req.body?.place || {}
      const osmId = String(place.osmId || "").slice(0, 40)
      const name = String(place.name || "").trim().slice(0, 60)
      const mood = MOODS.includes(req.body?.mood) ? req.body.mood : moodFor(place.kind)
      if (!osmId || !name) return res.status(400).json({ error: "which place?" })
      let { data: spot } = Number(place.spotId)
        ? await db.from("spots").select("id, mood").eq("id", Number(place.spotId)).maybeSingle()
        : await db.from("spots").select("id, mood").eq("osm_id", osmId).maybeSingle()
      if (!spot) {
        const { data: made, error } = await db.from("spots").insert({
          city: "medellin",
          mood,
          name,
          area: String(place.area || "").toLowerCase().slice(0, 40) || null,
          kind: String(place.kind || "").replace(/_/g, " ").slice(0, 30) || null,
          maps_url: place.mapsUrl ? String(place.mapsUrl).slice(0, 500) : null,
          sort: 900,
          added_by: me.memberNo,
          osm_id: osmId,
        }).select("id, mood").single()
        if (error) throw error
        spot = made
        // photos, rating and hours come from google in the background
        if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
          waitUntil(enrichSpots({
            ids: [spot.id],
            query: place.mapsUrl && /^https:\/\/www\.google\.[a-z.]+\/maps/.test(place.mapsUrl) ? null : `${name}, ${place.street || place.area || ""}, Medellín, Colombia`,
            url: place.mapsUrl && /^https:\/\/www\.google\.[a-z.]+\/maps/.test(place.mapsUrl) ? place.mapsUrl : null,
            near: { lat: place.lat, lng: place.lng, name },
          }).catch((e) => console.error("enrich added spot:", e)))
        }
      }
      req.body.spotId = spot.id
    }

    if (action === "going" || action === "add") {
      const spotId = Number(req.body?.spotId)
      if (!spotId) return res.status(400).json({ error: "which spot?" })
      if (req.body?.on === false) {
        await db.from("spot_going").delete().eq("spot_id", spotId).eq("member_no", me.memberNo).eq("night", night)
      } else {
        // one spot per mood per night: going somewhere new for pregame moves you
        // off the old pregame spot (pregame + afters on the same night is fine)
        const { data: spot } = await db.from("spots").select("mood").eq("id", spotId).maybeSingle()
        if (spot) {
          const { data: sameMood } = await db.from("spots").select("id").eq("mood", spot.mood).neq("id", spotId)
          const ids = (sameMood || []).map((x) => x.id)
          if (ids.length) {
            await db.from("spot_going").delete().eq("member_no", me.memberNo).eq("night", night).in("spot_id", ids)
          }
        }
        await db.from("spot_going").upsert({ spot_id: spotId, member_no: me.memberNo, night }, { onConflict: "spot_id,member_no,night" })
        // a ping to whoever's already going: the plan just got a person bigger
        const [{ data: others }, { data: sp }] = await Promise.all([
          db.from("spot_going").select("member_no").eq("spot_id", spotId).eq("night", night).neq("member_no", me.memberNo).limit(20),
          db.from("spots").select("name").eq("id", spotId).maybeSingle(),
        ])
        const first = String(me.name || "someone").split(/\s+/)[0]
        for (const o of others || []) {
          waitUntil(notifyMemberNo(o.member_no, {
            subject: `${first} is going to ${sp?.name || "your spot"} too`,
            line: `${first} is going to ${sp?.name || "your spot"} ${when}`,
            push: { title: `${first} joined your plan`, body: `going to ${sp?.name || "your spot"} ${when}. say hi in the group`, tag: `spot-${spotId}`, go: `spot-${spotId}` },
            email: false,
          }).catch(() => {}))
        }
      }
      return res.status(200).json({ ok: true })
    }

    // "make a plan with sofia": you're going somewhere, and she gets asked along.
    // the invite is what the pass delivers (the plan itself is free to make).
    if (action === "invite") {
      const spotId = Number(req.body?.spotId)
      const to = String(req.body?.to || "")
      if (!spotId || !/^\d{3}$/.test(to) || to === me.memberNo) return res.status(400).json({ error: "who's it for?" })
      // same safety rule as dms: someone who only takes messages from women never gets this from a man
      const { data: target } = await db.from("members").select("allow_dm_from_men, banned").eq("member_no", to).maybeSingle()
      if (!target || target.banned) return res.status(404).json({ error: "who's it for?" })
      if (me.gender === "man" && target.allow_dm_from_men === false && !actsAsMod(me)) return res.status(403).json({ error: "they only take plans from women" })
      const reach = actsAsMod(me) ? { ok: true } : await canReach(me, "medellin", night, night)
      if (!reach.ok) return res.status(402).json({ error: "your plan is ready. start your free month to send it.", gate: "invite" })
      const { data: sp } = await db.from("spots").select("name").eq("id", spotId).maybeSingle()
      const first = String(me.name || "someone").split(/\s+/)[0]
      waitUntil(notifyMemberNo(to, {
        subject: `${first} made a plan with you`,
        line: `${first} is going to ${sp?.name || "a spot"} ${when} and wants you there.`,
        ctaLabel: "see the plan",
        push: { title: `${first} made a plan with you`, body: `${sp?.name || "a spot"} ${when}. you in?`, tag: `spot-${spotId}`, go: `spot-${spotId}` },
      }).catch(() => {}))
      return res.status(200).json({ ok: true })
    }

    if (action === "out") {
      if (req.body?.off) {
        await db.from("presence").delete().eq("member_no", me.memberNo)
        return res.status(200).json({ ok: true, out: null })
      }
      // neighborhood only: no digits (addresses), short
      const area = String(req.body?.area || "").replace(/[0-9#]/g, "").replace(/\s+/g, " ").trim().slice(0, 40)
      if (!area) return res.status(400).json({ error: "which neighborhood?" })
      const until = outUntil(req.body?.until)
      const { data: before } = await db.from("presence").select("expires_at").eq("member_no", me.memberNo).maybeSingle()
      const newOuting = !before || new Date(before.expires_at) < new Date()
      const row = {
        member_no: me.memberNo,
        city: "medellin",
        area,
        expires_at: until.toISOString(),
        created_at: new Date().toISOString(),
      }
      await db.from("presence").upsert(row, { onConflict: "member_no" })

      // one post to the medellín room per outing (edits don't repost). the end
      // time is in the text, so the message never needs updating when it expires.
      if (newOuting) {
        const { data: going } = await db.from("spot_going").select("spot_id").eq("member_no", me.memberNo).eq("night", night)
        const { data: spots } = going?.length ? await db.from("spots").select("id, name").in("id", going.map((g) => g.spot_id)) : { data: [] }
        const first = String(me.name || "someone").split(/\s+/)[0]
        const text = `📍 ${first} is out in ${area} til ${fmtUntil(until)}${spots?.length ? ` · going to ${spots.map((x) => `@[${x.name.replace(/[[\]()]/g, "")}](s${x.id})`).join(" + ")}` : ""}. come say hi`
        await db.from("messages").insert({ channel: "medellin", body: text, from_name: me.name, from_ig: me.ig, from_member_no: me.memberNo })
      }
      return res.status(200).json({ ok: true, out: row, posted: newOuting })
    }

    // mods curate the board from ops
    if (action === "spot") {
      if (!actsAsMod(me)) return res.status(403).json({ error: "mods only" })
      const { id, name, area, kind, tag, mood, sort, active } = req.body || {}
      const patch = {}
      if (name !== undefined) patch.name = String(name).trim().slice(0, 60)
      if (area !== undefined) patch.area = String(area).trim().slice(0, 40) || null
      if (kind !== undefined) patch.kind = String(kind).trim().slice(0, 30) || null
      if (tag !== undefined) patch.tag = String(tag).trim().slice(0, 20) || null
      if (mood !== undefined) {
        if (!MOODS.includes(mood)) return res.status(400).json({ error: "mood must be pregame, afters or chill" })
        patch.mood = mood
      }
      if (sort !== undefined) patch.sort = Number(sort) || 100
      if (active !== undefined) patch.active = !!active
      if (id) {
        const { error } = await db.from("spots").update(patch).eq("id", Number(id))
        if (error) throw error
      } else {
        if (!patch.name || !patch.mood) return res.status(400).json({ error: "a spot needs a name and a mood" })
        const { error } = await db.from("spots").insert({ city: "medellin", ...patch })
        if (error) throw error
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: "unknown action" })
  } catch (e) {
    console.error("mood error:", e)
    return res.status(500).json({ error: "something went wrong" })
  }
}

// openstreetmap (photon) inside medellín's metro area. venues only, and each
// one gets the mood it most likely belongs on.
const KINDS = new Set(["bar", "pub", "nightclub", "restaurant", "cafe", "biergarten", "fitness_centre", "sports_centre", "park", "spa", "ice_cream", "fast_food", "food_court", "events_venue", "music_venue", "hotel", "garden", "yoga", "bakery", "juice"])
function moodFor(kind) {
  if (["nightclub", "music_venue", "events_venue"].includes(kind)) return "afters"
  if (["bar", "pub", "biergarten", "restaurant", "hotel"].includes(kind)) return "pregame"
  return "chill"
}
async function searchPlaces(q) {
  const text = q.trim().slice(0, 60)
  if (text.length < 2) return []
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&lat=6.21&lon=-75.57&limit=12&bbox=-75.70,6.10,-75.45,6.40`
  const r = await fetch(url, { headers: { "user-agent": "irlpass/1.0 (hello@irlpass.xyz)" } }).catch(() => null)
  if (!r?.ok) return []
  const d = await r.json().catch(() => ({}))
  const seen = new Set()
  const out = []
  for (const f of d.features || []) {
    const p = f.properties || {}
    if (!p.name || !KINDS.has(p.osm_value)) continue
    const key = `${p.name.toLowerCase()}|${p.district || p.suburb || ""}`
    if (seen.has(key)) continue
    seen.add(key)
    const [lng, lat] = f.geometry?.coordinates || []
    out.push({
      osmId: `${p.osm_type || "N"}${p.osm_id}`,
      name: p.name,
      kind: p.osm_value,
      area: p.district || p.suburb || p.locality || "",
      street: p.street || "",
      lat,
      lng,
      mood: moodFor(p.osm_value),
    })
  }
  if (!out.length) return out
  // already on the guide? match by osm id, or by name without accents
  // ("salon amador" on the map is our "Salón Amador")
  const norm = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
  const [{ data: have }, { data: curated }] = await Promise.all([
    db.from("spots").select("id, osm_id").in("osm_id", out.map((x) => x.osmId)),
    db.from("spots").select("id, name").eq("city", "medellin").eq("active", true),
  ])
  const byOsm = new Map((have || []).map((h) => [h.osm_id, h.id]))
  const byName = new Map((curated || []).map((c) => [norm(c.name), c.id]))
  return out.slice(0, 6).map((x) => ({ ...x, spotId: byOsm.get(x.osmId) || byName.get(norm(x.name)) || null }))
}

// google's category ("wine bar", "night club") -> our osm-style kind
function guessKind(cat) {
  const c = String(cat || "")
  if (/night ?club|disco|dance/.test(c)) return "nightclub"
  if (/bar|pub|brew|cocktail|wine|rooftop/.test(c)) return "bar"
  if (/restaurant|grill|steak|sushi|pizza|bistro/.test(c)) return "restaurant"
  if (/gym|fitness|yoga|pilates|crossfit/.test(c)) return "fitness_centre"
  if (/spa|sauna|massage/.test(c)) return "spa"
  return "cafe"
}
