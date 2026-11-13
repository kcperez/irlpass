import Anthropic from "@anthropic-ai/sdk"
import { getUser, lockedPhoto, safeFirstName, rowToMember } from "./_lib.js"
import { db } from "./_db.js"
import { canReach, today } from "./_access.js"
import { actsAsMod } from "./_mods.js"
import { waitUntil } from "@vercel/functions"
import { enrichSpots, googleSearch, priceLevelOf } from "./_guide.js"
import { sendAlert } from "./_send.js"
import { notifyMemberNo } from "./_notify.js"
import { openAt, fmtMin } from "./_hours.js"
import { cityInfo, localNow, nightIn, offsetMs } from "./_place.js"
import { isValidCity } from "./_cities.js"

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

// josh v4: lock in (weekday wellness) and explore join the night moods
export const MOODS = ["lockin", "explore", "pregame", "afters", "chill"]

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// "til 9pm", "til midnight" or "all night": every out status ends by 6am
// local time, so nobody still looks out the next afternoon
function outUntil(choice, tz) {
  const off = offsetMs(tz)
  const nowLocal = new Date(Date.now() + off)
  const at = (h) => {
    const d = new Date(nowLocal)
    d.setUTCHours(h, 0, 0, 0)
    if (d <= nowLocal) d.setUTCDate(d.getUTCDate() + 1)
    return new Date(d.getTime() - off)
  }
  const sixAm = at(6)
  const pick = { "9pm": at(21), midnight: at(24 % 24), late: sixAm }[choice] || new Date(Date.now() + 4 * 3600e3)
  return pick > sixAm ? sixAm : pick
}
const fmtUntil = (d, tz) => {
  const h = localNow(tz, d.getTime()).hour
  if (h === 0) return "midnight"
  if (h === 6) return "late"
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`
}

// "tonight" runs until 6am local, so an afters crowd at 2am is still tonight.
// no timezone = medellín's (the shared default for older callers)
export const tonight = (tz = "America/Bogota") => nightIn(tz)

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  // every tab follows the member's current city (josh v5): the board, the
  // clock, presence, the room an "i'm out" posts to
  const askedCity = String((req.method === "GET" ? req.query?.city : req.body?.city) || "")
  const city = isValidCity(askedCity) ? askedCity : (me.city || "medellin")
  const here = await cityInfo(city)
  const tz = here.tz
  // plans can be for tonight or any night in the next two weeks
  const tn = tonight(tz)
  const asked = String((req.method === "GET" ? req.query?.night : req.body?.night) || "")
  const night = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= tn && asked <= addDays(tn, 14) ? asked : tn
  const when = night === tn ? "tonight" : `on ${new Date(`${night}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase()}`

  try {
    // the slow, complete search: google maps itself (~20s). for spots the map
    // data doesn't have, or a pasted google maps link
    if (req.method === "GET" && req.query?.google) {
      const asked = String(req.query.google)
      const out = await googleSearch(asked, here).catch((e) => ({ error: String(e?.message || e) }))
      if (out.error || !out.places?.length) {
        // the scraper is down or found nothing: the open map, typo-forgiving
        console.error("google search fallback:", out.error || "empty")
        let found = await searchPlaces(asked, here)
        if (!found.length) {
          const fixed = await spellPlace(asked, here)
          if (fixed && fixed.toLowerCase() !== asked.toLowerCase()) found = await searchPlaces(fixed, here)
        }
        if (found.length) return res.status(200).json({ places: found })
        if (out.error) return res.status(200).json({ places: [], error: "couldn't find that one. try the full name, or drop a pin" })
      }
      return res.status(200).json({ places: out.places.map((p) => ({ ...p, mood: moodFor(guessKind(p.kind)) })) })
    }

    if (req.method === "GET" && req.query?.search) {
      return res.status(200).json({ places: await searchPlaces(String(req.query.search), here) })
    }

    if (req.method === "GET") {
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
      // "down to hang" right now in this city (3 hours from when they tapped it)
      const { data: downRows } = await db.from("members").select("member_no, down_mood, down_until").eq("down_city", city).gt("down_until", new Date().toISOString()).limit(60)
      const myDatesHere = (myTripsHere || 0) > 0
      const chatCount = {}
      for (const m of roomMsgs || []) {
        const id = Number(m.channel.split("-")[1])
        chatCount[id] = (chatCount[id] || 0) + 1
      }

      // everyone we need to draw: people going somewhere tonight + people out
      const nos = [...new Set([...(going || []).map((g) => g.member_no), ...(out || []).map((p) => p.member_no), ...(downRows || []).map((d) => d.member_no)])]
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

      // what's open right now, on the city's own clock: at 3am a closed bar is useless
      const { day: nowDay, min: nowMin } = localNow(tz)
      const board = Object.fromEntries(MOODS.map((mood) => [mood, []]))
      for (const s of spots || []) {
        if (!board[s.mood]) continue
        // recovery spots (gyms, yoga, sauna) also belong on lock in
        const alsoLockin = s.mood === "chill" && s.tag === "recovery"
        // a member-added spot waits for approval (its adder and mods see it as
        // "new"); an older search-add shows while somebody's going to it
        if (s.pending && s.added_by !== me.memberNo && !actsAsMod(me)) continue
        // spots the shuffle found (real google listings with photos) seed a new
        // city's guide, so no city opens to a blank board
        const seeded = s.added_by === "ai" && Array.isArray(s.photos) && s.photos.length > 0 && (s.rating || 0) >= 4
        if (s.added_by && !seeded && !s.pending && !s.approved && !goingBySpot[s.id] && !actsAsMod(me)) continue
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
          isNew: !!s.pending || (!!s.approved && s.approved_at && Date.now() - new Date(s.approved_at).getTime() < 14 * 864e5),
          pending: !!s.pending,
          priceLevel: s.price_level || null,
          priceRange: s.price_range || "",
          groupSpend: s.group_spend_pp || null,
          partner: perkBySpot[s.id] || null,
          mood: s.mood,
          room: `spot-${s.id}-${night.replace(/-/g, "")}`,
          chat: chatCount[s.id] || 0,
        })
        if (alsoLockin) board.lockin.push(board[s.mood][board[s.mood].length - 1])
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
        city,
        cityName: here.name,
        center: Number.isFinite(here.lat) ? { lat: here.lat, lng: here.lng } : null,
        night,
        tonight: tn,
        mood: myMood?.mood || null,
        board,
        presence: (out || []).map((p) => ({ ...face(p.member_no), area: p.area, until: p.expires_at })).filter((p) => p.memberNo),
        down: (downRows || []).map((d) => ({ ...face(d.member_no), mood: d.down_mood, until: d.down_until })).filter((p) => p.memberNo),
        myDown: (downRows || []).find((d) => d.member_no === me.memberNo)?.down_until || null,
        budget: me.budget && me.budget !== "skip" ? me.budget : null,
        local: (() => { const l = localNow(tz); return { day: l.day, hour: l.hour } })(),
        myOut: (out || []).find((p) => p.member_no === me.memberNo) || null,
      })
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const { action } = req.body || {}

    if (action === "mood") {
      const mood = String(req.body?.mood || "")
      if (!MOODS.includes(mood)) return res.status(400).json({ error: "pick a mood" })
      if (mood === "lockin" || mood === "explore") return res.status(200).json({ ok: true, mood })
      await db.from("moods").upsert(
        { member_no: me.memberNo, night, mood, city, updated_at: new Date().toISOString() },
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
          city,
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
            query: place.mapsUrl && /^https:\/\/www\.google\.[a-z.]+\/maps/.test(place.mapsUrl) ? null : `${name}, ${place.street || place.area || ""}, ${here.name}${here.country ? `, ${here.country}` : ""}`,
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
        const { data: spot } = await db.from("spots").select("mood, city").eq("id", spotId).maybeSingle()
        if (spot) {
          const { data: sameMood } = await db.from("spots").select("id").eq("mood", spot.mood).eq("city", spot.city || city).neq("id", spotId)
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
      const reach = actsAsMod(me) ? { ok: true } : await canReach(me, city, night, night)
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
      const until = outUntil(req.body?.until, tz)
      const { data: before } = await db.from("presence").select("expires_at").eq("member_no", me.memberNo).maybeSingle()
      const newOuting = !before || new Date(before.expires_at) < new Date()
      const row = {
        member_no: me.memberNo,
        city,
        area,
        expires_at: until.toISOString(),
        created_at: new Date().toISOString(),
      }
      await db.from("presence").upsert(row, { onConflict: "member_no" })

      // one post to the city's room per outing (edits don't repost). the end
      // time is in the text, so the message never needs updating when it expires.
      if (newOuting) {
        const { data: going } = await db.from("spot_going").select("spot_id").eq("member_no", me.memberNo).eq("night", night)
        const { data: spots } = going?.length ? await db.from("spots").select("id, name").in("id", going.map((g) => g.spot_id)) : { data: [] }
        const first = String(me.name || "someone").split(/\s+/)[0]
        const text = `📍 ${first} is out in ${area} til ${fmtUntil(until, tz)}${spots?.length ? ` · going to ${spots.map((x) => `@[${x.name.replace(/[[\]()]/g, "")}](s${x.id})`).join(" + ")}` : ""}. come say hi`
        await db.from("messages").insert({ channel: city, body: text, from_name: me.name, from_ig: me.ig, from_member_no: me.memberNo })
      }
      return res.status(200).json({ ok: true, out: row, posted: newOuting })
    }

    // "down to hang now": 3 hours, built into mood. everyone in the city who's
    // also down gets told (capped, quiet hours, mutable: see _send.js)
    if (action === "down") {
      if (req.body?.on === false) {
        await db.from("members").update({ down_until: null }).eq("member_no", me.memberNo)
        return res.status(200).json({ ok: true, down: null })
      }
      const mood = MOODS.includes(req.body?.mood) ? req.body.mood : "chill"
      const until = new Date(Date.now() + 3 * 3600e3).toISOString()
      const { data: before } = await db.from("members").select("down_until").eq("member_no", me.memberNo).maybeSingle()
      const fresh = !before?.down_until || new Date(before.down_until) < new Date()
      await db.from("members").update({ down_until: until, down_mood: mood, down_city: city }).eq("member_no", me.memberNo)
      if (fresh) {
        const { data: others } = await db.from("members").select("member_no, gender, allow_dm_from_men").eq("down_city", city).gt("down_until", new Date().toISOString()).neq("member_no", me.memberNo).limit(40)
        const first = String(me.name || "someone").split(/\s+/)[0]
        const label = { lockin: "lock in", explore: "explore" }[mood] || mood
        for (const o of others || []) {
          // same safety rule as dms
          if (me.gender === "man" && o.allow_dm_from_men === false) continue
          waitUntil(sendAlert(o.member_no, { kind: "down", title: `${first}'s down to hang`, body: `${label} mood. say hi or make a plan`, go: `dm-${me.memberNo}` }))
        }
      }
      return res.status(200).json({ ok: true, down: until })
    }

    // "know a spot? add it": google maps first (one tap pulls name, address,
    // hours, photos, price), or a dropped pin when it's too new for google.
    // goes live after a mod approves it, and every one is a pro lead.
    if (action === "suggest") {
      const place = req.body?.place || {}
      const name = String(place.name || "").trim().slice(0, 60)
      const mood = MOODS.includes(req.body?.mood) ? req.body.mood : "chill"
      const lat = Number(place.lat), lng = Number(place.lng)
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "which place?" })
      const placeId = place.placeId ? String(place.placeId).slice(0, 80) : null
      if (placeId) {
        const { data: have } = await db.from("spots").select("id, pending, active").eq("place_id", placeId).maybeSingle()
        if (have) return res.status(200).json({ ok: true, exists: true, spotId: have.id, pending: have.pending })
      }
      const lvl = Number(req.body?.priceLevel) || priceLevelOf(place.price)
      const { data: made, error } = await db.from("spots").insert({
        city,
        mood,
        name,
        area: String(place.area || "").toLowerCase().slice(0, 40) || null,
        kind: String(place.kind || "").replace(/_/g, " ").slice(0, 30) || null,
        address: String(place.address || place.street || "").slice(0, 200) || null,
        maps_url: place.mapsUrl ? String(place.mapsUrl).slice(0, 500) : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        lat, lng,
        place_id: placeId,
        price_level: lvl >= 1 && lvl <= 4 ? lvl : null,
        note: String(req.body?.note || "").trim().slice(0, 140) || null,
        blurb: String(req.body?.note || "").trim().slice(0, 140) || null,
        sort: 800,
        added_by: me.memberNo,
        osm_id: placeId ? `G${placeId}`.slice(0, 40) : null,
        pending: !actsAsMod(me),
        approved: actsAsMod(me),
        approved_at: actsAsMod(me) ? new Date().toISOString() : null,
        pro_lead: true,
        active: true,
      }).select("id").single()
      if (error) throw error
      // a photo from the member (pin-only spots)
      const img = String(req.body?.photo || "").match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
      if (img) {
        const buf = Buffer.from(img[2], "base64")
        if (buf.length < 2_500_000) {
          const path = `spots/${made.id}-u.jpg`
          const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
            method: "POST",
            headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, "content-type": `image/${img[1]}`, "x-upsert": "true" },
            body: buf,
          })
          if (up.ok) await db.from("spots").update({ photos: [`${process.env.SUPABASE_URL}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`] }).eq("id", made.id)
        }
      }
      if (place.google) {
        waitUntil(enrichSpots({ ids: [made.id], url: place.mapsUrl || null, near: { lat, lng, name } }).catch((e) => console.error("enrich suggested:", e)))
      }
      return res.status(200).json({ ok: true, spotId: made.id, pending: !actsAsMod(me) })
    }

    // mods: approve or turn down a member's spot
    if (action === "review-spot") {
      if (!actsAsMod(me)) return res.status(403).json({ error: "mods only" })
      const id = Number(req.body?.id)
      if (req.body?.ok) await db.from("spots").update({ pending: false, approved: true, approved_at: new Date().toISOString(), active: true }).eq("id", id)
      else await db.from("spots").update({ pending: false, active: false }).eq("id", id)
      return res.status(200).json({ ok: true })
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
        const { error } = await db.from("spots").insert({ city, ...patch })
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

// openstreetmap (photon) around the city's centre. venues only, and each
// one gets the mood it most likely belongs on.
const KINDS = new Set(["bar", "pub", "nightclub", "restaurant", "cafe", "biergarten", "fitness_centre", "sports_centre", "park", "spa", "ice_cream", "fast_food", "food_court", "events_venue", "music_venue", "hotel", "garden", "yoga", "bakery", "juice"])
function moodFor(kind) {
  if (["nightclub", "music_venue", "events_venue"].includes(kind)) return "afters"
  if (["bar", "pub", "biergarten", "restaurant", "hotel"].includes(kind)) return "pregame"
  return "chill"
}
// "buata" -> "Buatta": one quick fix of a misspelled spot name, for the open map
async function spellPlace(q, here) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const d = await new Anthropic().messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 40,
      messages: [{ role: "user", content: `someone in ${here?.name || "the city"} typed this to find a bar, restaurant, cafe or venue there: "${String(q).slice(0, 60)}". reply with only the place's correctly spelled name, nothing else.` }],
    }, { timeout: 4000 })
    return String(d?.content?.[0]?.text || "").replace(/["\n]/g, "").trim().slice(0, 60) || null
  } catch { return null }
}

async function searchPlaces(q, here) {
  const text = q.trim().slice(0, 60)
  if (text.length < 2) return []
  const lat = Number.isFinite(here?.lat) ? here.lat : 6.21
  const lng = Number.isFinite(here?.lng) ? here.lng : -75.57
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&lat=${lat}&lon=${lng}&limit=12&bbox=${(lng - 0.25).toFixed(3)},${(lat - 0.25).toFixed(3)},${(lng + 0.25).toFixed(3)},${(lat + 0.25).toFixed(3)}`
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
    db.from("spots").select("id, name").eq("city", here?.slug || "medellin").eq("active", true),
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
