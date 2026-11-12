import { actsAsMod } from "./_mods.js"
import { getUser, lockedPhoto, rowToMember, safeFirstName } from "./_lib.js"
import { db } from "./_db.js"
import { dmState } from "./_dmstate.js"
import { tonight } from "./mood.js"
import { isValidCity, canonicalCity } from "./_cities.js"
import { canReach, today, overlaps } from "./_access.js"

// v2: you only exist here once you've posted dates. a member with no upcoming
// trip is not listed and cannot be messaged — there is nothing to meet about.
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const city = isValidCity(canonicalCity(req.query?.city)) ? canonicalCity(req.query.city) : me.city || "medellin"
  const horizon = addDays(today(), 90)

  try {
    // everything that doesn't depend on anything else, in one parallel round
    // (this used to be nine round trips back to back)
    const night = tonight()
    const [
      { data: trips },
      { data: mine },
      { data: threads },
      dms,
      { data: outRows },
      { data: goingRows },
      { data: planRows },
      { data: cityRows },
    ] = await Promise.all([
      db.from("trips")
        .select("member_no, starts, ends, flexible, note, local, area")
        .eq("city", city)
        .eq("hidden", false)
        .gte("ends", today())
        .lte("starts", horizon)
        .order("starts")
        .limit(300),
      // my own windows, so we can mark who overlaps me and price the unlock
      db.from("trips").select("starts, ends").eq("member_no", me.memberNo).eq("city", city).gte("ends", today()),
      // people already talking to me are never hidden
      db.from("dm_threads").select("a_no, b_no").or(`a_no.eq.${me.memberNo},b_no.eq.${me.memberNo}`),
      dmState(me.memberNo),
      // who's going out tonight: an "i'm out" status, or "i'm going" on a spot
      db.from("presence").select("member_no, area").gt("expires_at", new Date().toISOString()),
      db.from("spot_going").select("member_no, spot_id").eq("night", night),
      // "out tonight?" / "which nights this week?" answers, tonight onward
      db.from("night_plans").select("member_no, night").eq("city", city).eq("answer", "out").gte("night", night),
      // everyone who belongs to this city, dates or not
      db.from("members").select("*").eq("city", city).eq("banned", false).lt("member_no", "900").limit(200),
    ])
    const known = new Set((threads || []).map((t) => (t.a_no === me.memberNo ? t.b_no : t.a_no)))

    const nos = [...new Set((trips || []).map((t) => t.member_no))].filter((n) => n !== me.memberNo)
    const [{ data: rows }, { data: goingSpots }] = await Promise.all([
      nos.length ? db.from("members").select("*").in("member_no", nos) : { data: [] },
      goingRows?.length
        ? db.from("spots").select("id, name, area").in("id", [...new Set(goingRows.map((g) => g.spot_id))])
        : { data: [] },
    ])
    const byNo = new Map((rows || []).map((r) => [r.member_no, rowToMember(r)]))
    const spotById = new Map((goingSpots || []).map((x) => [x.id, x]))
    const outTonight = new Map()
    // two states: "out now" (they set an out status) and "going out tn" (they
    // tapped going on a spot). out now wins and gets the pulsing dot.
    for (const g of goingRows || []) {
      const sp = spotById.get(g.spot_id)
      if (sp) outTonight.set(g.member_no, { now: false, area: sp.area || "", spot: sp.name, spotId: sp.id })
    }
    // "down tonight" from the daily prompt: lowest of the three, no place yet
    for (const p of planRows || []) {
      if (p.night === night && !outTonight.has(p.member_no)) outTonight.set(p.member_no, { now: false, area: "", spot: null, down: true })
    }
    for (const o of outRows || []) outTonight.set(o.member_no, { ...(outTonight.get(o.member_no) || {}), now: true, area: o.area })

    // the strip counts people, not trips: someone with two stays on the same day
    // is one head, so each day holds a set of member numbers
    const daySets = {}
    for (const trip of trips || []) {
      if (trip.member_no === me.memberNo) continue
      for (const d of eachDay(trip.starts, trip.ends)) {
        ;(daySets[d] = daySets[d] || new Set()).add(trip.member_no)
      }
    }
    const days = Object.fromEntries(Object.entries(daySets).map(([d, set]) => [d, set.size]))
    // who's down which night, from the prompts: the night-level view of the week
    const downSets = {}
    for (const p of planRows || []) if (p.member_no !== me.memberNo) (downSets[p.night] = downSets[p.night] || new Set()).add(p.member_no)
    const down = Object.fromEntries(Object.entries(downSets).map(([d, set]) => [d, set.size]))
    const downBy = new Map()
    for (const p of planRows || []) downBy.set(p.member_no, [...(downBy.get(p.member_no) || []), p.night])

    // and one row per person, with their stays merged into a single span
    const mergedTrips = new Map()
    for (const trip of trips || []) {
      if (trip.member_no === me.memberNo) continue
      const prev = mergedTrips.get(trip.member_no)
      if (!prev) { mergedTrips.set(trip.member_no, { ...trip }); continue }
      prev.starts = prev.starts < trip.starts ? prev.starts : trip.starts
      prev.ends = prev.ends > trip.ends ? prev.ends : trip.ends
      prev.flexible = prev.flexible || trip.flexible
      prev.local = prev.local || trip.local
      prev.note = prev.note || trip.note
      prev.area = prev.area || trip.area
    }

    // access depends on my window, not on them: check each of my windows once
    const reachCache = new Map()
    const reachFor = (w) => {
      const k = `${w.starts}:${w.ends}`
      if (!reachCache.has(k)) reachCache.set(k, canReach(me, city, w.starts, w.ends))
      return reachCache.get(k)
    }

    const out = []
    for (const trip of mergedTrips.values()) {
      const m = byNo.get(trip.member_no)
      if (!m || m.banned) continue

      const mineOverlap = (mine || []).find((x) => overlaps(x.starts, x.ends, trip.starts, trip.ends))
      const access = mineOverlap ? await reachFor(mineOverlap) : { ok: false }
      const open = access.ok || known.has(m.memberNo) || actsAsMod(me)
      const blocked = me.gender === "man" && m.allowDmFromMen === false
      // give to get: post your dates here and you see real faces (unless they hid theirs)
      const faceOpen = open || ((mine || []).length > 0 && !m.hidePhoto && !blocked)

      out.push({
        memberNo: m.memberNo,
        faceOpen,
        first: open ? String(m.name || "").trim().split(/\s+/)[0] || "someone" : safeFirstName(m.name, m.ig),
        name: open ? m.name : null,
        ig: open ? m.ig : null,
        photo: faceOpen ? m.photo : lockedPhoto(m.photo),
        verified: m.verified,
        repScore: m.repScore,
        repCount: m.repCount,
        starts: trip.starts,
        ends: trip.ends,
        flexible: !!trip.flexible,
        local: !!trip.local,
        hereNow: trip.starts <= today() && trip.ends >= today(),
        note: open ? trip.note || "" : "",
        area: open ? trip.area || "" : "",
        overlapsMe: !!mineOverlap,
        shared: sharedWith(me.interests, m.interests),
        locked: !open,
        canMessage: open && !blocked,
        talked: !!dms.get(m.memberNo)?.talked,
        out: outTonight.get(m.memberNo) || null,
        downNights: downBy.get(m.memberNo) || [],
        // where they're from: the country they gave, and the city they live in
        country: m.country || null,
        home: m.homeCity || null,
        unread: dms.get(m.memberNo)?.unread || 0,
        womenOnly: m.allowDmFromMen === false,
      })
    }

    // everyone else who belongs to this city: chat regulars, people between
    // trips, locals who haven't put dates up. coordination needs them visible.
    const listed = new Set(out.map((p) => p.memberNo))

    const others = []
    for (const r of cityRows || []) {
      if (r.member_no === me.memberNo || listed.has(r.member_no)) continue
      const m = rowToMember(r)
      const blocked = me.gender === "man" && m.allowDmFromMen === false
      const anyTrip = (trips || []).find((tr) => tr.member_no === m.memberNo)
      const seen = known.has(m.memberNo) || actsAsMod(me)
      others.push({
        memberNo: m.memberNo,
        // same rules as the dated list: people you haven't talked to are a
        // preview (first name + soft photo) until you share dates or unlock
        first: seen ? String(m.name || "").trim().split(/\s+/)[0] || "someone" : safeFirstName(m.name, m.ig),
        name: seen ? m.name : null,
        photo: seen ? m.photo : lockedPhoto(m.photo),
        locked: !seen,
        verified: m.verified,
        hasDates: !!anyTrip,
        shared: sharedWith(me.interests, m.interests),
        starts: anyTrip?.starts || null,
        ends: anyTrip?.ends || null,
        canMessage: seen && !blocked,
        talked: !!dms.get(m.memberNo)?.talked,
        out: outTonight.get(m.memberNo) || null,
        downNights: downBy.get(m.memberNo) || [],
        // where they're from: the country they gave, and the city they live in
        country: m.country || null,
        home: m.homeCity || null,
        unread: dms.get(m.memberNo)?.unread || 0,
        womenOnly: m.allowDmFromMen === false,
      })
    }

    return res.status(200).json({
      city,
      iHaveDates: (mine || []).length > 0,
      days,                       // head count per day, for the calendar strip
      down,                       // how many said they're down each night (prompts)
      night,                      // tonight's date, medellín time
      people: out,
      others,
      inCity: (cityRows || []).length,
      myTrips: mine || [],
      total: out.length,
    })
  } catch (e) {
    console.error("members error:", e)
    return res.status(500).json({ error: "could not load who's around" })
  }
}

const sharedWith = (mine = [], theirs = []) => {
  const set = new Set((mine || []).map((x) => String(x).toLowerCase()))
  return (theirs || []).filter((x) => set.has(String(x).toLowerCase())).slice(0, 3)
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function eachDay(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 180; d = addDays(d, 1)) out.push(d)
  return out
}
