import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { actsAsMod } from "./_mods.js"
import { today } from "./_access.js"
import { backfillPhotos } from "./_instagram.js"

// long enough for one scraper run over every member missing a photo
export const config = { maxDuration: 300 }

// the founders' view: what happened today, what's on the calendar, who's stuck.
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me || !actsAsMod(me)) return res.status(401).json({ error: "not allowed" })

  // POST ?t=&action=backfill-photos -> pull instagram photos for everyone without one
  // POST ?t=&action=refresh-photos&batch=N -> re-pull instagram photos for everyone, 60 at a time
  if (req.method === "POST" && (req.query?.action === "backfill-photos" || req.query?.action === "refresh-photos")) {
    try {
      const refresh = req.query.action === "refresh-photos"
      return res.status(200).json(await backfillPhotos({ refresh, batch: Number(req.query.batch || 0) }))
    } catch (e) {
      console.error("backfill error:", e)
      return res.status(500).json({ error: "backfill failed" })
    }
  }

  try {
    const since = (days) => new Date(Date.now() - days * 864e5).toISOString()

    const { data: members } = await db
      .from("members")
      .select("member_no, name, ig, email, city, accepted_at, photo_url, ig_verified, ig_followers, paid, comped, stripe_customer, founding_no, banned, verify_seen_at, interests")
      .lt("member_no", "900")
      .order("accepted_at", { ascending: false })
      .limit(400)

    const { data: trips } = await db
      .from("trips")
      .select("id, member_no, city, starts, ends, flexible, local, created_at")
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

    // cities people asked for but we haven't opened, most-wanted first
    const { data: asks } = await db.from("city_requests").select("city, member_no")
    const askTally = {}
    for (const a of asks || []) {
      askTally[a.city] = askTally[a.city] || new Set()
      if (a.member_no) askTally[a.city].add(a.member_no)
    }
    const requested = Object.entries(askTally)
      .map(([city, set]) => ({ city, people: set.size }))
      .sort((a, b) => b.people - a.people)
      .slice(0, 12)

    // EDC mood funnel: mood set -> "i'm going" -> do people come back and change it
    const [{ data: moodRows }, { data: goingRows }, { data: spotsRows }] = await Promise.all([
      db.from("moods").select("member_no, night, mood"),
      db.from("spot_going").select("spot_id, member_no, night"),
      db.from("spots").select("*").order("mood").order("sort").order("id"),
    ])
    const tonightKey = new Date(Date.now() - 11 * 3600e3).toISOString().slice(0, 10)
    const nightsBy = {}
    for (const m of moodRows || []) (nightsBy[m.member_no] = nightsBy[m.member_no] || []).push(m.mood)
    const goingPeople = new Set((goingRows || []).map((g) => g.member_no))
    const moodStats = {
      setTonight: (moodRows || []).filter((m) => m.night === tonightKey).length,
      setEver: Object.keys(nightsBy).length,
      goingTonight: (goingRows || []).filter((g) => g.night === tonightKey).length,
      goingPeople: goingPeople.size,
      cameBack: Object.values(nightsBy).filter((l) => l.length >= 2).length,
      changedMood: Object.values(nightsBy).filter((l) => new Set(l).size >= 2).length,
    }
    const goingCount = {}
    for (const g of goingRows || []) if (g.night === tonightKey) goingCount[g.spot_id] = (goingCount[g.spot_id] || 0) + 1
    const spotsAll = (spotsRows || []).map((sp) => ({ ...sp, goingTonight: goingCount[sp.id] || 0 }))

    const all = members || []
    // vibes_seen_at comes from migration 004. read on its own so ops still loads if it hasn't run.
    const { data: seenRows } = await db.from("members").select("member_no").not("vibes_seen_at", "is", null).lt("member_no", "900")
    const vibesSeen = (seenRows || []).length
    const joinedSince = (days) => all.filter((m) => m.accepted_at >= since(days)).length

    // which cities have dates on them, and how many people each
    const byCity = {}
    for (const t of trips || []) {
      byCity[t.city] = byCity[t.city] || new Set()
      byCity[t.city].add(t.member_no)
    }
    const byNo = new Map(all.map((m) => [m.member_no, m]))
    const cities = Object.entries(byCity)
      .map(([city, set]) => ({
        city,
        people: set.size,
        // who is actually there, with their dates, so you can see the room
        roster: (trips || [])
          .filter((t) => t.city === city)
          .sort((a, b) => (a.starts < b.starts ? -1 : 1))
          .map((t) => {
            const m = byNo.get(t.member_no)
            return {
              memberNo: t.member_no,
              ig: m?.ig || t.member_no,
              name: m?.name || null,
              photo: m?.photo_url || null,
              followers: m?.ig_followers ?? null,
              verified: !!m?.ig_verified,
              starts: t.starts,
              ends: t.ends,
              local: !!t.local,
              flexible: !!t.flexible,
            }
          }),
      }))
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
      requested,
      verifyFunnel: {
        reached: all.filter((m) => m.verify_seen_at).length,
        completed: all.filter((m) => m.ig_verified).length,
      },
      mood: moodStats,
      spots: spotsAll,
      // vibes: existing members who were shown the prompt vs everyone with 3+
      // picked. new signups pick inside the flow, so they count as finished.
      vibesFunnel: {
        seen: vibesSeen,
        finished: all.filter((m) => (m.interests || []).length >= 3).length,
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
