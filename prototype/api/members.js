import { getUser, lockedPhoto, rowToMember } from "./_lib.js"
import { db } from "./_db.js"
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
    const { data: trips } = await db
      .from("trips")
      .select("member_no, starts, ends, flexible, note, local, area")
      .eq("city", city)
      .gte("ends", today())
      .lte("starts", horizon)
      .order("starts")
      .limit(300)

    // my own windows, so we can mark who overlaps me and price the unlock
    const { data: mine } = await db
      .from("trips")
      .select("starts, ends")
      .eq("member_no", me.memberNo)
      .eq("city", city)
      .gte("ends", today())

    const nos = [...new Set((trips || []).map((t) => t.member_no))].filter((n) => n !== me.memberNo)
    const { data: rows } = nos.length
      ? await db.from("members").select("*").in("member_no", nos)
      : { data: [] }
    const byNo = new Map((rows || []).map((r) => [r.member_no, rowToMember(r)]))

    // people already talking to me are never hidden
    const { data: threads } = await db
      .from("dm_threads")
      .select("a_no, b_no")
      .or(`a_no.eq.${me.memberNo},b_no.eq.${me.memberNo}`)
    const known = new Set((threads || []).map((t) => (t.a_no === me.memberNo ? t.b_no : t.a_no)))

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

    const out = []
    for (const trip of mergedTrips.values()) {
      const m = byNo.get(trip.member_no)
      if (!m || m.banned) continue

      const mineOverlap = (mine || []).find((x) => overlaps(x.starts, x.ends, trip.starts, trip.ends))
      const access = mineOverlap ? await canReach(me, city, mineOverlap.starts, mineOverlap.ends) : { ok: false }
      const open = access.ok || known.has(m.memberNo)
      const blocked = me.gender === "man" && m.allowDmFromMen === false

      out.push({
        memberNo: m.memberNo,
        first: String(m.name || "").trim().split(/\s+/)[0] || "someone",
        name: open ? m.name : null,
        ig: open ? m.ig : null,
        photo: open ? m.photo : lockedPhoto(m.photo),
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
        womenOnly: m.allowDmFromMen === false,
      })
    }

    // everyone else who belongs to this city: chat regulars, people between
    // trips, locals who haven't put dates up. coordination needs them visible.
    const listed = new Set(out.map((p) => p.memberNo))
    const { data: cityRows } = await db
      .from("members")
      .select("*")
      .eq("city", city)
      .eq("banned", false)
      .lt("member_no", "900")
      .limit(200)

    const others = []
    for (const r of cityRows || []) {
      if (r.member_no === me.memberNo || listed.has(r.member_no)) continue
      const m = rowToMember(r)
      const blocked = me.gender === "man" && m.allowDmFromMen === false
      const anyTrip = (trips || []).find((tr) => tr.member_no === m.memberNo)
      others.push({
        memberNo: m.memberNo,
        first: String(m.name || "").trim().split(/\s+/)[0] || "someone",
        name: m.name,
        photo: m.photo,
        verified: m.verified,
        hasDates: !!anyTrip,
        shared: sharedWith(me.interests, m.interests),
        starts: anyTrip?.starts || null,
        ends: anyTrip?.ends || null,
        canMessage: known.has(m.memberNo) && !blocked,
        womenOnly: m.allowDmFromMen === false,
      })
    }

    return res.status(200).json({
      city,
      iHaveDates: (mine || []).length > 0,
      days,                       // head count per day, for the calendar strip
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
