import { db } from "./_db.js"
import { getUser, lockedPhoto } from "./_lib.js"
import { actsAsMod } from "./_mods.js"

// what's on in a city, who from irlpass is going, and each event's group chat.
// GET  /api/events?t&city            -> the next 14 days
// GET  /api/events?t&id              -> one event
// POST { t, id, going: true|false }  -> going joins the event chat (channel ev-<id>)
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "someone"

async function withGoing(rows, me) {
  const ids = rows.map((e) => e.id)
  if (!ids.length) return []
  const { data: going } = await db.from("event_going").select("event_id, member_no").in("event_id", ids)
  const nos = [...new Set((going || []).map((g) => g.member_no))]
  const { data: members } = nos.length ? await db.from("members").select("member_no, name, photo_url, banned").in("member_no", nos) : { data: [] }
  const byNo = new Map((members || []).filter((m) => !m.banned).map((m) => [m.member_no, m]))
  const mine = new Set((going || []).filter((g) => g.member_no === me.memberNo).map((g) => g.event_id))
  const mod = actsAsMod(me)
  return rows.map((e) => {
    const who = (going || []).filter((g) => g.event_id === e.id && byNo.has(g.member_no)).map((g) => byNo.get(g.member_no))
    // going yourself is the give-to-get: then you see who else is
    const open = mod || mine.has(e.id)
    return {
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      venue: e.venue,
      address: e.address,
      lat: e.lat,
      lng: e.lng,
      cover: e.cover,
      url: e.url,
      source: e.source,
      priceCents: e.price_cents,
      currency: e.currency,
      isFree: e.is_free,
      category: e.category,
      host: e.host,
      featured: e.featured,
      claimed: !!e.claimed_by,
      channel: `ev-${e.id}`,
      going: mine.has(e.id),
      goingCount: who.length,
      faces: who.slice(0, 6).map((m) => ({
        memberNo: m.member_no,
        first: first(m.name),
        photo: open || m.member_no === me.memberNo ? m.photo_url || null : lockedPhoto(m.photo_url),
      })),
    }
  })
}

export default async function handler(req, res) {
  const token = req.method === "POST" ? req.body?.t : req.query?.t
  const me = await getUser(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      if (req.query?.id) {
        const { data: e } = await db.from("events").select("*").eq("id", Number(req.query.id)).eq("hidden", false).maybeSingle()
        if (!e) return res.status(404).json({ error: "that event is gone" })
        return res.status(200).json({ event: (await withGoing([e], me))[0] })
      }
      const city = String(req.query?.city || me.city || "medellin")
      const from = new Date(Date.now() - 3 * 3600e3).toISOString()
      const to = new Date(Date.now() + 14 * 864e5).toISOString()
      const { data: rows } = await db
        .from("events")
        .select("*")
        .eq("city", city)
        .eq("hidden", false)
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("featured", { ascending: false })
        .order("starts_at")
        .limit(300)
      res.setHeader("cache-control", "private, max-age=30")
      return res.status(200).json({ city, events: await withGoing(rows || [], me) })
    }

    if (req.method === "POST") {
      const id = Number(req.body?.id)
      const { data: e } = await db.from("events").select("id, title, starts_at").eq("id", id).eq("hidden", false).maybeSingle()
      if (!e) return res.status(404).json({ error: "that event is gone" })
      const channel = `ev-${id}`
      if (req.body?.going === false) {
        await db.from("event_going").delete().eq("event_id", id).eq("member_no", me.memberNo)
      } else {
        const { data: had } = await db.from("event_going").select("event_id").eq("event_id", id).eq("member_no", me.memberNo).maybeSingle()
        if (!had) {
          await db.from("event_going").insert({ event_id: id, member_no: me.memberNo })
          // say it in the room, so the chat is never a blank page
          await db.from("messages").insert({
            channel,
            body: `${first(me.name)} is going 🙌`,
            from_name: "irlpass",
            from_ig: "@irlpass.xyz",
            from_member_no: "000",
          })
        }
      }
      const [out] = await withGoing([{ ...(await db.from("events").select("*").eq("id", id).single()).data }], me)
      return res.status(200).json({ event: out })
    }
    return res.status(405).json({ error: "method not allowed" })
  } catch (err) {
    console.error("events error:", err)
    return res.status(500).json({ error: "couldn't load events" })
  }
}
