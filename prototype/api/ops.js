import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isMod } from "./_mods.js"
import { today } from "./_access.js"

// the founders' view: what happened today, what's on the calendar, who's stuck.
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me || !isMod(me.memberNo)) return res.status(401).json({ error: "not allowed" })

  try {
    const since = (days) => new Date(Date.now() - days * 864e5).toISOString()

    const { data: members } = await db
      .from("members")
      .select("member_no, name, ig, email, city, accepted_at, photo_url, ig_verified, ig_followers, paid, comped, stripe_customer, founding_no, banned")
      .lt("member_no", "900")
      .order("accepted_at", { ascending: false })
      .limit(400)

    const { data: trips } = await db
      .from("trips")
      .select("id, member_no, city, starts, ends, flexible, created_at")
      .gte("ends", today())
      .order("created_at", { ascending: false })

    const { data: dms } = await db
      .from("dm_messages")
      .select("id, created_at")
      .gte("created_at", since(7))

    const { data: room } = await db
      .from("messages")
      .select("id, channel, created_at")
      .gte("created_at", since(7))

    const { data: unlocks } = await db.from("unlocks").select("id, city, created_at, source")

    const all = members || []
    const joinedSince = (days) => all.filter((m) => m.accepted_at >= since(days)).length

    // which cities have dates on them, and how many people each
    const byCity = {}
    for (const t of trips || []) {
      byCity[t.city] = byCity[t.city] || new Set()
      byCity[t.city].add(t.member_no)
    }
    const cities = Object.entries(byCity)
      .map(([city, set]) => ({ city, people: set.size }))
      .sort((a, b) => b.people - a.people)

    const withTrips = new Set((trips || []).map((t) => t.member_no))

    return res.status(200).json({
      members: {
        total: all.length,
        today: joinedSince(1),
        week: joinedSince(7),
        verified: all.filter((m) => m.ig_verified).length,
        withPhoto: all.filter((m) => m.photo_url).length,
        // only real stripe customers count as paying; comped founders are not revenue
        paying: all.filter((m) => m.stripe_customer).length,
        comped: all.filter((m) => m.comped || (m.paid && !m.stripe_customer)).length,
        founding: all.filter((m) => m.founding_no).length,
      },
      calendar: {
        tripsUp: (trips || []).length,
        peopleWithDates: withTrips.size,
        silent: all.length - withTrips.size, // signed up, never posted dates
        cities,
      },
      activity: {
        dmsWeek: (dms || []).length,
        roomWeek: (room || []).length,
        unlocks: (unlocks || []).length,
      },
      recent: all.slice(0, 25).map((m) => ({
        memberNo: m.member_no,
        name: m.name,
        ig: m.ig,
        city: m.city,
        at: m.accepted_at,
        verified: !!m.ig_verified,
        followers: m.ig_followers,
        hasDates: withTrips.has(m.member_no),
        banned: !!m.banned,
      })),
      upcoming: (trips || []).slice(0, 25).map((t) => ({
        city: t.city,
        starts: t.starts,
        ends: t.ends,
        memberNo: t.member_no,
        who: all.find((m) => m.member_no === t.member_no)?.ig || t.member_no,
      })),
    })
  } catch (e) {
    console.error("ops error:", e)
    return res.status(500).json({ error: "could not load ops" })
  }
}
