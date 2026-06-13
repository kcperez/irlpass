import { randomBytes } from "node:crypto"
import { getMember } from "./_lib.js"
import { db } from "./_db.js"
import { notifyMemberNo } from "./_notify.js"

const rowToActivity = (r) => ({
  id: r.id,
  title: r.title,
  when: r.when_text,
  spots: r.spots,
  creator: r.creator,
  joined: r.joined,
  createdAt: r.created_at,
  place: r.place_name,
  lat: r.lat,
  lng: r.lng,
  emoji: r.emoji || null,
  details: r.details || null,
  date: r.event_date,
})

const bogotaToday = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)

export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query?.t : req.body?.t
  const me = await getMember(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const scope = String(req.query?.scope || "board")
      const today = bogotaToday()
      let q = db.from("activities").select("*").limit(200)
      if (scope === "past") {
        // my memories: things i joined whose day has passed
        q = q.lt("event_date", today).order("event_date", { ascending: false })
      } else if (scope === "chats") {
        // chats keep breathing for a week after the event
        const weekAgo = new Date(Date.now() - 5 * 3600e3 - 7 * 86400e3).toISOString().slice(0, 10)
        q = q.gte("event_date", weekAgo).order("event_date", { ascending: true })
      } else {
        // the board and map only show today and the future
        q = q.gte("event_date", today).order("event_date", { ascending: true })
      }
      const { data, error } = await q
      if (error) throw error
      let acts = data.map(rowToActivity)
      if (scope === "past" || scope === "chats") {
        acts = acts.filter((a) => a.joined.some((j) => j.memberNo === me.memberNo))
      }
      return res.status(200).json({ activities: acts })
    }

    if (req.method === "POST") {
      const { action } = req.body || {}
      const meLite = { name: me.name, ig: me.ig, memberNo: me.memberNo }

      if (action === "create") {
        const { title, when, spots, place, emoji, details, date } = req.body
        if (!title || !String(title).trim() || !when) {
          return res.status(400).json({ error: "title and when required" })
        }
        const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : bogotaToday()
        if (eventDate < bogotaToday()) return res.status(400).json({ error: "that day already happened" })
        // double-tap guard: same creator + same title in the last 10 minutes -> return the existing one
        const { data: dupe } = await db
          .from("activities")
          .select("*")
          .eq("title", String(title).trim().slice(0, 90))
          .gte("created_at", new Date(Date.now() - 600_000).toISOString())
          .limit(1)
          .maybeSingle()
        if (dupe && dupe.creator.memberNo === me.memberNo) {
          return res.status(200).json({ ok: true, activity: rowToActivity(dupe) })
        }
        const row = {
          id: randomBytes(8).toString("hex"),
          title: String(title).trim().slice(0, 90),
          when_text: String(when).slice(0, 60),
          spots: parseInt(spots) === 999 ? 999 : Math.min(Math.max(parseInt(spots) || 6, 2), 30),
          creator: meLite,
          joined: [meLite],
          place_name: place?.name ? String(place.name).slice(0, 60) : null,
          lat: typeof place?.lat === "number" ? place.lat : null,
          lng: typeof place?.lng === "number" ? place.lng : null,
          emoji: emoji ? String(emoji).slice(0, 8) : null,
          details: details ? String(details).slice(0, 280) : null,
          event_date: eventDate,
        }
        const { data, error } = await db.from("activities").insert(row).select().single()
        if (error) throw error
        // kick off the activity chat so nobody walks into an empty room
        const kickoffs = [
          `${me.name.toLowerCase()} put this on the board. say hi, lock the details, make it real.`,
          `new plan by ${me.name.toLowerCase()}. first one to reply picks the meeting spot.`,
          `${me.name.toLowerCase()} started this. drop a hi if you're in, logistics here.`,
        ]
        await db.from("messages").insert({
          channel: row.id,
          body: kickoffs[row.id.charCodeAt(0) % kickoffs.length],
          from_name: "irlpass",
          from_ig: "@irlpass.xyz",
          from_member_no: "000",
        })
        return res.status(200).json({ ok: true, activity: rowToActivity(data) })
      }

      if (action === "update") {
        const { id, details, emoji } = req.body
        if (!id || !/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: "bad id" })
        const { data: row } = await db.from("activities").select("creator").eq("id", id).single()
        if (!row) return res.status(404).json({ error: "not found" })
        if (row.creator.memberNo !== me.memberNo) return res.status(403).json({ error: "only the creator can edit" })
        const patch = {}
        if (details !== undefined) patch.details = String(details || "").slice(0, 280) || null
        if (emoji !== undefined) patch.emoji = String(emoji || "").slice(0, 8) || null
        const { data, error } = await db.from("activities").update(patch).eq("id", id).select().single()
        if (error) throw error
        return res.status(200).json({ ok: true, activity: rowToActivity(data) })
      }

      if (action === "delete") {
        const { id } = req.body
        if (!id || !/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: "bad id" })
        const { data: row } = await db.from("activities").select("creator").eq("id", id).single()
        if (!row) return res.status(404).json({ error: "not found" })
        if (row.creator.memberNo !== me.memberNo) return res.status(403).json({ error: "only the creator can delete" })
        await db.from("messages").delete().eq("channel", id)
        await db.from("activities").delete().eq("id", id)
        return res.status(200).json({ ok: true })
      }

      if (action === "join" || action === "leave") {
        const { id } = req.body
        if (!id || !/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: "bad id" })
        const { data: row, error: ge } = await db.from("activities").select("*").eq("id", id).single()
        if (ge || !row) return res.status(404).json({ error: "not found" })

        const inIt = row.joined.some((j) => j.memberNo === me.memberNo)
        let joined = row.joined
        if (action === "join") {
          if (!inIt) {
            if (row.spots < 999 && joined.length >= row.spots) return res.status(409).json({ error: "full" })
            joined = [...joined, meLite]
          }
        } else {
          if (row.creator.memberNo === me.memberNo) return res.status(400).json({ error: "creator can't leave" })
          joined = joined.filter((j) => j.memberNo !== me.memberNo)
        }
        const { data, error } = await db.from("activities").update({ joined }).eq("id", id).select().single()
        if (error) throw error
        // tell the creator someone joined their plan
        if (action === "join" && !inIt && row.creator.memberNo !== me.memberNo) {
          notifyMemberNo(row.creator.memberNo, {
            subject: `${me.name.toLowerCase()} joined your plan`,
            line: `${me.name.toLowerCase()} is in for "${row.title}". the chat's open — lock the details.`,
            ctaLabel: "open the chat",
          })
        }
        return res.status(200).json({ ok: true, activity: rowToActivity(data) })
      }

      return res.status(400).json({ error: "unknown action" })
    }

    return res.status(405).json({ error: "method not allowed" })
  } catch (e) {
    console.error("activities error:", e)
    return res.status(500).json({ error: "activities failed" })
  }
}
