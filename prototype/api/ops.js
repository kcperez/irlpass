import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { actsAsMod } from "./_mods.js"
import { today, setting } from "./_access.js"
import { backfillPhotos, backfillNames } from "./_instagram.js"
import { enrichSpots } from "./_guide.js"
import { welcomeText, sendWelcome, WELCOME_FROM } from "./_welcome.js"

// long enough for one scraper run over every member missing a photo
export const config = { maxDuration: 300 }

// the founders' view: what happened today, what's on the calendar, who's stuck.
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me || !actsAsMod(me)) return res.status(401).json({ error: "not allowed" })

  // POST ?t=&action=backfill-photos -> pull instagram photos for everyone without one
  // josh's welcome dm: save the text, or send it to everyone who hasn't had it
  if (req.method === "POST" && req.query?.action === "welcome-text") {
    const value = String(req.body?.text || "").trim().slice(0, 1000)
    if (value.length < 10) return res.status(400).json({ error: "write the message first" })
    await db.from("app_settings").upsert({ key: "welcome_dm", value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    return res.status(200).json({ ok: true })
  }
  if (req.method === "POST" && req.query?.action === "welcome-backfill") {
    const template = await welcomeText()
    const { data: people } = await db.from("members").select("member_no, name, city, home_city, banned").lt("member_no", "900").neq("member_no", WELCOME_FROM)
    let sent = 0
    for (const m of (people || []).filter((x) => !x.banned)) {
      if (await sendWelcome(m, template).catch(() => false)) sent++
    }
    return res.status(200).json({ sent })
  }

  // one-time codes for a free month: ride buyers, hosts, partners, promos
  if (req.method === "POST" && req.query?.action === "make-codes") {
    const kind = ["ride", "host", "promo", "referral"].includes(req.body?.kind) ? req.body.kind : "promo"
    const count = Math.min(200, Math.max(1, Number(req.body?.count) || 1))
    const months = Math.min(12, Math.max(1, Number(req.body?.months) || 1))
    const maxUses = Math.min(1000, Math.max(1, Number(req.body?.maxUses) || 1))
    const prefix = String(req.body?.prefix || kind).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
    const note = String(req.body?.note || "").slice(0, 140) || null
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    const rand = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")
    const rows = Array.from({ length: count }, () => ({ code: `${prefix}-${rand()}`, kind, months, max_uses: maxUses, note, created_by: me.memberNo }))
    const { error } = await db.from("codes").insert(rows)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ codes: rows.map((r) => r.code) })
  }

  // the few settings ops can change without a deploy
  if (req.method === "POST" && req.query?.action === "setting") {
    const key = String(req.body?.key || "")
    const allowed = { founding_free_dms: /^(on|off)$/, referral_reward_cents: /^\d{1,5}$/, trial_days: /^\d{1,2}$/ }
    const value = String(req.body?.value ?? "").trim()
    if (!allowed[key] || !allowed[key].test(value)) return res.status(400).json({ error: "not a setting ops can change" })
    await db.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    return res.status(200).json({ ok: true })
  }

  // the guaranteed ride: create or edit one
  if (req.method === "POST" && req.query?.action === "ride") {
    const b = req.body || {}
    const patch = {}
    if (b.title !== undefined) patch.title = String(b.title).trim().slice(0, 80)
    if (b.night !== undefined) patch.night = String(b.night).slice(0, 10)
    if (b.depart !== undefined) patch.depart = String(b.depart).trim().slice(0, 80) || null
    if (b.priceCents !== undefined) patch.price_cents = Math.max(100, Number(b.priceCents) || 5000)
    if (b.seats !== undefined) patch.seats = Math.max(1, Number(b.seats) || 8)
    if (b.active !== undefined) patch.active = !!b.active
    if (b.city !== undefined) patch.city = String(b.city).slice(0, 40)
    if (b.id) {
      const { error } = await db.from("rides").update(patch).eq("id", Number(b.id))
      if (error) return res.status(500).json({ error: error.message })
    } else {
      if (!patch.title || !/^\d{4}-\d{2}-\d{2}$/.test(patch.night || "")) return res.status(400).json({ error: "a ride needs a title and a date" })
      const { error } = await db.from("rides").insert(patch)
      if (error) return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  // GET ?t=&action=email-health -> what resend says about our sending domain:
  // verified or not, and every dns record it expects (spf, dkim, mx) with status
  if (req.query?.action === "email-health") {
    try {
      const key = process.env.RESEND_API_KEY
      if (!key) return res.status(200).json({ error: "no resend key" })
      const h = { authorization: `Bearer ${key}` }
      const list = await fetch("https://api.resend.com/domains", { headers: h }).then((r) => r.json())
      const domains = []
      for (const d of list?.data || []) {
        const full = await fetch(`https://api.resend.com/domains/${d.id}`, { headers: h }).then((r) => r.json())
        domains.push({ name: full.name, status: full.status, region: full.region, records: full.records })
      }
      return res.status(200).json({ domains })
    } catch (e) {
      console.error("email health error:", e)
      return res.status(500).json({ error: "could not reach resend" })
    }
  }

  // POST ?t=&action=backfill-names -> real names from instagram for handle-only members
  if (req.method === "POST" && req.query?.action === "backfill-names") {
    try {
      return res.status(200).json(await backfillNames())
    } catch (e) {
      console.error("backfill names error:", e)
      return res.status(500).json({ error: "names failed" })
    }
  }

  // POST ?t=&action=enrich-spots -> next few spots get their google maps listing + photos
  if (req.method === "POST" && req.query?.action === "enrich-spots") {
    try {
      const ids = req.query.ids ? String(req.query.ids).split(",").map(Number).filter(Boolean) : null
      return res.status(200).json(await enrichSpots({ ids, limit: Number(req.query.limit || 4), query: req.query.q || null }))
    } catch (e) {
      console.error("enrich spots error:", e)
      return res.status(500).json({ error: "enrich failed" })
    }
  }

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
      conversion: await conversionView(byNo),
      welcome: await welcomeText(),
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

// codes, rides, referrals, hosts and the knobs, for the conversion section of ops
async function conversionView(byNo) {
  const [{ data: codes }, { data: rides }, { data: orders }, { data: refs }, { data: hosts }, { data: comps }] = await Promise.all([
    db.from("codes").select("*").order("created_at", { ascending: false }).limit(60),
    db.from("rides").select("*").order("night", { ascending: false }).limit(20),
    db.from("ride_orders").select("ride_id, member_no, status, created_at").eq("status", "paid"),
    db.from("referrals").select("referee, referrer, rewarded_at"),
    db.from("host_interest").select("*").order("created_at", { ascending: false }),
    db.from("members").select("member_no").gte("comp_until", today()),
  ])
  const who = (no) => ({ memberNo: no, name: byNo.get(no)?.name || no, ig: byNo.get(no)?.ig || "" })
  return {
    settings: {
      founding_free_dms: await setting("founding_free_dms", "off"),
      referral_reward_cents: await setting("referral_reward_cents", "2900"),
      trial_days: await setting("trial_days", "30"),
    },
    codes: codes || [],
    rides: (rides || []).map((r) => ({
      ...r,
      buyers: (orders || []).filter((o) => o.ride_id === r.id).map((o) => who(o.member_no)),
    })),
    referrals: { joined: (refs || []).length, rewarded: (refs || []).filter((r) => r.rewarded_at).length },
    hosts: (hosts || []).map((h) => ({ ...who(h.member_no), earn: h.earn_range, note: h.note, at: h.created_at })),
    compedNow: (comps || []).length,
  }
}
