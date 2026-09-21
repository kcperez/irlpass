import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isValidCity, cityLabel, OPEN_AT, cityBySlug, canonicalCity } from "./_cities.js"
import { claimFoundingSlot, foundingLeft, myUnlocks, today, isDate, overlaps } from "./_access.js"
import { sendEmail, matchEmail, cityOpenEmail } from "./_email.js"

const MAX_TRIPS = 6
const MAX_NIGHTS = 120

// GET  ?t=                     -> my trips, my unlocks, founding slots left
// GET  ?t=&city=&from=&to=     -> per-day head count for a city (the calendar)
// POST { t, city, starts, ends, flexible, note }  -> post dates (claims a founding slot)
// DELETE ?t=&id=               -> remove one of my trips
export default async function handler(req, res) {
  const token = req.method === "POST" ? req.body?.t : req.query?.t
  const me = await getUser(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const city = String(req.query?.city || "")
      if (city) {
        if (!isValidCity(city)) return res.status(400).json({ error: "unknown city" })
        const from = isDate(req.query?.from) ? req.query.from : today()
        const to = isDate(req.query?.to) ? req.query.to : addDays(from, 60)
        const { data } = await db
          .from("trips")
          .select("member_no, starts, ends")
          .eq("city", city)
          .lte("starts", to)
          .gte("ends", from)
        // head count per day, so the calendar can show where the week is busy
        const days = {}
        for (const t of data || []) {
          for (const d of eachDay(max(t.starts, from), min(t.ends, to))) {
            days[d] = (days[d] || 0) + (t.member_no === me.memberNo ? 0 : 1)
          }
        }
        return res.status(200).json({ city, from, to, days })
      }

      const { data: mine } = await db
        .from("trips")
        .select("*")
        .eq("member_no", me.memberNo)
        .gte("ends", today())
        .order("starts")
      return res.status(200).json({
        trips: (mine || []).map(shape),
        unlocks: await myUnlocks(me.memberNo),
        foundingFree: me.foundingFree,
        foundingNo: me.foundingNo,
        foundingLeft: await foundingLeft(),
      })
    }

    if (req.method === "POST") {
      let { starts } = req.body || {}
      const { ends, flexible, note, local } = req.body || {}
      const city = canonicalCity(req.body?.city)
      if (!isValidCity(city)) return res.status(400).json({ error: "pick a city" })
      if (!isDate(starts) || !isDate(ends)) return res.status(400).json({ error: "pick your dates" })
      if (ends < starts) return res.status(400).json({ error: "the end date is before the start date" })
      if (ends < today()) return res.status(400).json({ error: "those dates have already passed" })
      // a trip that's already underway is fine: it starts today from our side
      if (starts < today()) starts = today()
      if (nights(starts, ends) > MAX_NIGHTS) return res.status(400).json({ error: "keep a trip under 120 days" })

      const { count } = await db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("member_no", me.memberNo)
        .gte("ends", today())
      if ((count || 0) >= MAX_TRIPS) return res.status(400).json({ error: "you already have 6 trips posted" })

      const { data: trip, error } = await db
        .from("trips")
        .insert({
          member_no: me.memberNo,
          city,
          starts,
          ends,
          flexible: !!flexible,
          local: !!local,
          note: note ? String(note).slice(0, 140) : null,
        })
        .select("*")
        .single()
      if (error) throw error

      // first dates posted = claim one of the founding slots, while they last
      const foundingNo = await claimFoundingSlot(me)
      // tell the people already on those dates that someone new is coming
      notifyOverlap(me, trip).catch((e) => console.error("match email error:", e))
      // did this trip just tip the city over the line? tell everyone waiting on it
      maybeOpenCity(trip.city).catch((e) => console.error("city open error:", e))

      return res.status(200).json({
        trip: shape(trip),
        foundingNo,
        foundingFree: !!foundingNo || me.foundingFree,
        foundingLeft: await foundingLeft(),
      })
    }

    if (req.method === "DELETE") {
      const id = Number(req.query?.id)
      if (!id) return res.status(400).json({ error: "which trip?" })
      const { error } = await db.from("trips").delete().eq("id", id).eq("member_no", me.memberNo)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: "method not allowed" })
  } catch (e) {
    console.error("trips error:", e)
    return res.status(500).json({ error: "could not save your dates" })
  }
}

const shape = (t) => ({
  id: t.id,
  city: t.city,
  starts: t.starts,
  ends: t.ends,
  flexible: !!t.flexible,
  local: !!t.local,
  note: t.note || "",
})

const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
const max = (a, b) => (a > b ? a : b)
const min = (a, b) => (a < b ? a : b)
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function eachDay(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 200; d = addDays(d, 1)) out.push(d)
  return out
}

// email the members whose dates overlap this new trip. this is the loop that
// brings people back: someone lands on your dates, you hear about it.
async function notifyOverlap(me, trip) {
  const { data: rows } = await db
    .from("trips")
    .select("member_no, starts, ends")
    .eq("city", trip.city)
    .lte("starts", trip.ends)
    .gte("ends", trip.starts)
    .neq("member_no", me.memberNo)
  const nos = [...new Set((rows || []).filter((r) => overlaps(r.starts, r.ends, trip.starts, trip.ends)).map((r) => r.member_no))].slice(0, 40)
  if (!nos.length) return
  const { data: members } = await db
    .from("members")
    .select("member_no, name, email, token, notify")
    .in("member_no", nos)
  const cityName = cityLabel(trip.city)
  for (const m of members || []) {
    if (!m.email || !m.notify) continue
    await sendEmail({
      to: m.email,
      ...matchEmail({
        name: m.name,
        who: me.name,
        city: cityName,
        starts: trip.starts,
        ends: trip.ends,
        url: `https://irlpass.xyz/?screen=app&t=${m.token}`,
      }),
    })
  }
}

// a city opens the moment OPEN_AT people have dates in it. everyone who helped
// get it there hears about it once (members.city_opened_sent keeps it to once).
async function maybeOpenCity(city) {
  const meta = cityBySlug(city)
  if (!meta || meta.live) return
  const { data: trips } = await db.from("trips").select("member_no").eq("city", city)
  const nos = [...new Set((trips || []).map((t) => t.member_no))]
  if (nos.length < OPEN_AT) return
  const { data: members } = await db
    .from("members")
    .select("member_no, name, email, token, notify, city_opened")
    .in("member_no", nos)
  for (const m of members || []) {
    if (!m.email || !m.notify || m.city_opened === city) continue
    await sendEmail({
      to: m.email,
      ...cityOpenEmail({ name: m.name, city: meta.name, count: nos.length, url: `https://irlpass.xyz/?screen=app&t=${m.token}` }),
    })
    await db.from("members").update({ city_opened: city }).eq("member_no", m.member_no)
  }
}
