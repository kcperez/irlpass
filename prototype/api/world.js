import { getUser, lockedPhoto } from "./_lib.js"
import { db } from "./_db.js"
import { today } from "./_access.js"

// "where irlpass is": every city with people in it, on a map. the counts and
// blurred faces are the pull to go somewhere, or to join its chat. browsing is
// free; writing in a city you have no dates in takes the pass.
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    const now = today()
    const soon = addDays(now, 60)
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
    const [{ data: cities }, { data: trips }, { data: homes }, { data: msgs }, { data: out }, { data: myTrips }] = await Promise.all([
      db.from("cities").select("slug, name, emoji, lat, lng").not("lat", "is", null),
      db.from("trips").select("city, member_no, starts, ends, local").gte("ends", now).lte("starts", soon).lt("member_no", "900"),
      db.from("members").select("home_city, member_no, photo_url").not("home_city", "is", null).eq("banned", false).lt("member_no", "900"),
      db.from("messages").select("channel, created_at").gte("created_at", weekAgo).not("channel", "like", "spot-%"),
      db.from("presence").select("city").gt("expires_at", new Date().toISOString()),
      db.from("trips").select("city").eq("member_no", me.memberNo).gte("ends", now),
    ])

    const nos = [...new Set((trips || []).map((t) => t.member_no))]
    const { data: people } = nos.length
      ? await db.from("members").select("member_no, photo_url, banned").in("member_no", nos)
      : { data: [] }
    const photoOf = new Map((people || []).filter((p) => !p.banned).map((p) => [p.member_no, p.photo_url]))
    for (const h of homes || []) if (h.photo_url) photoOf.set(h.member_no, h.photo_url)

    const mine = new Set((myTrips || []).map((t) => t.city))
    const out2 = []
    for (const c of cities || []) {
      const cityTrips = (trips || []).filter((t) => t.city === c.slug)
      const visiting = new Set(cityTrips.filter((t) => !t.local).map((t) => t.member_no))
      const locals = new Set([
        ...cityTrips.filter((t) => t.local).map((t) => t.member_no),
        ...(homes || []).filter((h) => h.home_city === c.slug).map((h) => h.member_no),
      ])
      const hereNow = new Set(cityTrips.filter((t) => t.starts <= now && t.ends >= now).map((t) => t.member_no))
      const room = (msgs || []).filter((m) => m.channel === c.slug)
      const people = new Set([...visiting, ...locals])
      if (!people.size && !room.length) continue
      const faces = [...people].filter((no) => photoOf.get(no) && no !== me.memberNo).slice(0, 5).map((no) => lockedPhoto(photoOf.get(no))).filter(Boolean)
      out2.push({
        slug: c.slug,
        name: c.name,
        emoji: c.emoji || "📍",
        lat: c.lat,
        lng: c.lng,
        people: people.size,
        visiting: visiting.size,
        locals: locals.size,
        hereNow: hereNow.size,
        outTonight: (out || []).filter((o) => o.city === c.slug).length,
        chatWeek: room.length,
        chatLast: room.map((m) => m.created_at).sort().pop() || null,
        faces,
        mine: mine.has(c.slug),
      })
    }
    out2.sort((a, b) => b.people - a.people || b.chatWeek - a.chatWeek)
    res.setHeader("cache-control", "private, max-age=60")
    return res.status(200).json({ cities: out2, pass: !!me.paid || !!me.foundingFree })
  } catch (e) {
    console.error("world error:", e)
    return res.status(500).json({ error: "could not load the map" })
  }
}
