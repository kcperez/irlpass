import { db } from "./_db.js"
import { getUser, lockedPhoto } from "./_lib.js"
import { actsAsMod } from "./_mods.js"
import { notifyMemberNo } from "./_notify.js"

// what's on in a city, who from irlpass is going, and each event's group chat.
// GET  /api/events?t&city            -> the next 14 days
// GET  /api/events?t&id              -> one event
// POST { t, id, going: true|false }  -> going joins the event chat (channel ev-<id>)
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "someone"

async function withGoing(rows, me, lang = "en") {
  const ids = rows.map((e) => e.id)
  if (!ids.length) return []
  const { data: going } = await db.from("event_going").select("event_id, member_no").in("event_id", ids)
  const nos = [...new Set([...(going || []).map((g) => g.member_no), ...rows.map((e) => e.submitted_by).filter(Boolean)])]
  const { data: members } = nos.length ? await db.from("members").select("member_no, name, photo_url, banned").in("member_no", nos) : { data: [] }
  const byNo = new Map((members || []).filter((m) => !m.banned).map((m) => [m.member_no, m]))
  const named = new Map((members || []).map((m) => [m.member_no, first(m.name).toLowerCase()]))
  const mine = new Set((going || []).filter((g) => g.member_no === me.memberNo).map((g) => g.event_id))
  const mod = actsAsMod(me)
  return rows.map((e) => {
    const who = (going || []).filter((g) => g.event_id === e.id && byNo.has(g.member_no)).map((g) => byNo.get(g.member_no))
    // going yourself is the give-to-get: then you see who else is
    const open = mod || mine.has(e.id)
    return {
      id: e.id,
      title: (e.titles && e.titles[lang]) || e.title,
      original: e.title,
      city: e.city,
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
      category: e.category === "music" ? "party" : e.category,
      host: e.host,
      featured: e.featured,
      hosted: e.source === "irlpass",
      details: e.details || null,
      about: e.about ? e.about[lang] || e.about.en : null,
      capacity: e.capacity || null,
      spotsLeft: e.capacity ? Math.max(0, e.capacity - who.length) : null,
      mine: !!e.host_no && e.host_no === me.memberNo,
      perk: e.perk || null,
      addedBy: e.submitted_by ? named.get(e.submitted_by) || null : null,
      mineAdded: !!e.submitted_by && e.submitted_by === me.memberNo,
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
  const lang = (req.method === "POST" ? req.body?.lang : req.query?.lang) === "es" ? "es" : "en"
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      if (req.query?.id) {
        const { data: e } = await db.from("events").select("*").eq("id", Number(req.query.id)).eq("hidden", false).maybeSingle()
        if (!e) return res.status(404).json({ error: "that event is gone" })
        return res.status(200).json({ event: (await withGoing([e], me, lang))[0] })
      }
      // the event chats you're in: every event you said you're going to, newest
      // talk first, for the chat tab
      if (req.query?.mine) {
        const { data: mine } = await db.from("event_going").select("event_id").eq("member_no", me.memberNo).limit(200)
        const ids = (mine || []).map((g) => g.event_id)
        if (!ids.length) return res.status(200).json({ chats: [] })
        const since = new Date(Date.now() - 2 * 864e5).toISOString()
        const { data: evs } = await db.from("events").select("id, title, titles, cover, starts_at, ends_at, city, venue").in("id", ids).eq("hidden", false).or(`starts_at.gte.${since},ends_at.gte.${since}`)
        const chans = (evs || []).map((e) => `ev-${e.id}`)
        const { data: msgs } = chans.length ? await db.from("messages").select("id, channel, body, from_name, from_member_no, created_at").in("channel", chans).order("created_at", { ascending: false }).limit(400) : { data: [] }
        const last = {}
        for (const m of msgs || []) if (!last[m.channel]) last[m.channel] = m
        const chats = (evs || []).map((e) => {
          const m = last[`ev-${e.id}`]
          return {
            id: e.id, channel: `ev-${e.id}`, title: (e.titles && e.titles[lang]) || e.title, cover: e.cover, startsAt: e.starts_at, city: e.city, venue: e.venue,
            last: m ? { id: m.id, text: m.body, from: m.from_member_no === me.memberNo ? "you" : first(m.from_name).toLowerCase(), at: m.created_at } : null,
          }
        }).sort((a, b) => Date.parse(b.last?.at || 0) - Date.parse(a.last?.at || 0) || Date.parse(a.startsAt) - Date.parse(b.startsAt))
        return res.status(200).json({ chats })
      }
      const city = String(req.query?.city || me.city || "medellin")
      const from = new Date(Date.now() - 3 * 3600e3).toISOString()
      const to = new Date(Date.now() + 14 * 864e5).toISOString()
      const { data: rows } = await db
        .from("events")
        .select("*")
        .eq("city", city)
        .eq("hidden", false)
        .neq("source", "venue")
        .or(`starts_at.gte.${from},ends_at.gte.${new Date().toISOString()}`)
        .lte("starts_at", to)
        .order("featured", { ascending: false })
        .order("starts_at")
        .limit(300)
      res.setHeader("cache-control", "private, max-age=30")
      return res.status(200).json({ city, events: await withGoing(rows || [], me, lang) })
    }

    if (req.method === "POST") {
      const id = Number(req.body?.id)
      const { data: e } = await db.from("events").select("id, title, starts_at, price_cents, source, capacity").eq("id", id).eq("hidden", false).maybeSingle()
      if (!e) return res.status(404).json({ error: "that event is gone" })
      const channel = `ev-${id}`
      if (req.body?.going === false) {
        await db.from("event_going").delete().eq("event_id", id).eq("member_no", me.memberNo)
      } else {
        const { data: had } = await db.from("event_going").select("event_id").eq("event_id", id).eq("member_no", me.memberNo).maybeSingle()
        if (!had) {
          if (e.price_cents && e.source === "irlpass") return res.status(402).json({ error: "this one needs a ticket", gate: "ticket" })
          if (e.capacity) {
            const { count } = await db.from("event_going").select("event_id", { count: "exact", head: true }).eq("event_id", id)
            if (count >= e.capacity) return res.status(409).json({ error: "it's full" })
          }
          const via = /^\d{3}$/.test(String(req.body?.via || "")) && req.body.via !== me.memberNo ? req.body.via : null
          await db.from("event_going").insert({ event_id: id, member_no: me.memberNo, via })
          // say it in the room, so the chat is never a blank page
          await db.from("messages").insert({
            channel,
            body: `${first(me.name)} is going 🙌`,
            from_name: "irlpass",
            from_ig: "@irlpass.xyz",
            from_member_no: "000",
          })
          // came in through someone's share: the event lands in their dm (so the
          // conversation moves into irlpass) and the sharer hears they're going
          if (via) {
            const [a, b] = via < me.memberNo ? [via, me.memberNo] : [me.memberNo, via]
            const body = `https://irlpass.xyz/e/${id}`
            const now = new Date().toISOString()
            let { data: th } = await db.from("dm_threads").select("id").eq("a_no", a).eq("b_no", b).maybeSingle()
            if (!th) ({ data: th } = await db.from("dm_threads").insert({ a_no: a, b_no: b, last_at: now }).select("id").single())
            if (th) {
              const { count } = await db.from("dm_messages").select("id", { count: "exact", head: true }).eq("thread_id", th.id).eq("body", body)
              if (!count) {
                await db.from("dm_messages").insert({ thread_id: th.id, from_no: via, body })
                await db.from("dm_threads").update({ last_at: now }).eq("id", th.id)
              }
            }
            await notifyMemberNo(via, {
              subject: `${first(me.name)} is going to ${String(e.title).toLowerCase().slice(0, 60)}`,
              line: `${first(me.name)} opened the event you shared and tapped going. say hi in your chat.`,
              ctaLabel: "say hi",
              push: { title: `${first(me.name)} is going 🙌`, body: `to ${String(e.title).toLowerCase().slice(0, 80)}. say hi`, go: `dm-${me.memberNo}`, tag: `going-${id}` },
            }).catch(() => {})
          }
        }
      }
      const [out] = await withGoing([{ ...(await db.from("events").select("*").eq("id", id).single()).data }], me, lang)
      return res.status(200).json({ event: out })
    }
    return res.status(405).json({ error: "method not allowed" })
  } catch (err) {
    console.error("events error:", err)
    return res.status(500).json({ error: "couldn't load events" })
  }
}
