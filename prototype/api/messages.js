import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { notifyMemberNo } from "./_notify.js"
import { actsAsMod } from "./_mods.js"
import { today, hasComp, canReach } from "./_access.js"

// channels: a city slug (everyone in that city, plus mods) or a legacy activity id
async function canAccess(channel, me) {
  if (actsAsMod(me)) return true
  if (/^[a-z0-9][a-z0-9-]{1,39}$/.test(channel) && !/^[a-f0-9]{16}$/.test(channel)) return true
  if (!/^[a-f0-9]{16}$/.test(channel)) return false
  const { data } = await db.from("activities").select("joined").eq("id", channel).single()
  return !!data && data.joined.some((j) => j.memberNo === me.memberNo)
}

const rowToMsg = (m) => ({
  key: m.id,
  text: m.deleted ? "" : m.body,
  at: m.created_at,
  from: { name: m.from_name, ig: m.from_ig, memberNo: m.from_member_no },
  reactions: m.reactions || {},
  replyTo: m.reply_to,
  edited: m.edited,
  deleted: m.deleted,
})

export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query?.t : req.body?.t
  const me = await getUser(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const channel = String(req.query?.channel || "medellin")
      if (!(await canAccess(channel, me))) return res.status(403).json({ error: "join first" })
      const { data, error } = await db
        .from("messages")
        .select("*")
        .eq("channel", channel)
        .order("id", { ascending: false })
        .limit(150)
      if (error) throw error
      // everyone's current photo and name: a room is people, not emoji, and a
      // name fixed after the message was sent should show on it too
      const nos = [...new Set(data.map((m) => m.from_member_no))]
      const { data: people } = nos.length
        ? await db.from("members").select("member_no, name, photo_url, country").in("member_no", nos)
        : { data: [] }
      const who = new Map((people || []).map((p) => [p.member_no, p]))
      // the newest 150, oldest first. ascending + limit returned the first 150
      // ever sent, so a busy room would have stopped showing new messages.
      const messages = data.reverse().map((m) => {
        const msg = rowToMsg(m)
        const p = who.get(m.from_member_no)
        if (p) msg.from = { ...msg.from, name: p.name || msg.from.name, photo: p.photo_url || null, country: p.country || null }
        return msg
      })
      return res.status(200).json({ messages })
    }

    if (req.method === "POST") {
      const { action = "send", channel: ch, text, id, emoji, replyTo } = req.body || {}
      const channel = String(ch || "medellin")

      if (action === "send") {
        if (!text || !String(text).trim()) return res.status(400).json({ error: "empty" })
        if (!(await canAccess(channel, me))) return res.status(403).json({ error: "join first" })
        // a spot's room tonight (spot-<id>-<yyyymmdd>) is for people going there
        const spotRoom = channel.match(/^spot-(\d+)-(\d{4})(\d{2})(\d{2})$/)
        if (spotRoom && !actsAsMod(me)) {
          const { count } = await db
            .from("spot_going")
            .select("spot_id", { count: "exact", head: true })
            .eq("spot_id", Number(spotRoom[1]))
            .eq("member_no", me.memberNo)
            .eq("night", `${spotRoom[2]}-${spotRoom[3]}-${spotRoom[4]}`)
          if (!count) return res.status(402).json({ error: "tap i'm going to write here", gate: "going" })
          // the plan's group chat is where people actually meet up: the pass delivers it
          const reach = await canReach(me, "medellin", `${spotRoom[2]}-${spotRoom[3]}-${spotRoom[4]}`, `${spotRoom[2]}-${spotRoom[3]}-${spotRoom[4]}`)
          if (!reach.ok) return res.status(402).json({ error: "your message is ready. start your free month to deliver it.", gate: "deliver" })
        }
        // a city room is for people who are actually going to be there, or who
        // hold the pass (every city's chat is part of it)
        else if (!actsAsMod(me) && !me.paid && !hasComp(me) && /^[a-z0-9][a-z0-9-]{1,39}$/.test(channel) && !/^[a-f0-9]{16}$/.test(channel)) {
          const { count } = await db
            .from("trips")
            .select("id", { count: "exact", head: true })
            .eq("member_no", me.memberNo)
            .eq("city", channel)
            .gte("ends", today())
          if (!count) {
            return res.status(402).json({ error: "post your dates for this city to write here", gate: "dates", city: channel })
          }
        }
        const { error } = await db.from("messages").insert({
          channel,
          body: String(text).trim().slice(0, 1000),
          from_name: me.name,
          from_ig: me.ig,
          from_member_no: me.memberNo,
          reply_to: Number.isInteger(replyTo) ? replyTo : null,
        })
        if (error) throw error
        // if this is a reply, email the person being replied to
        if (Number.isInteger(replyTo)) {
          const { data: parent } = await db.from("messages").select("from_member_no, body").eq("id", replyTo).maybeSingle()
          if (parent && parent.from_member_no !== me.memberNo && parent.from_member_no !== "000") {
            notifyMemberNo(parent.from_member_no, {
              subject: `${me.name.toLowerCase()} replied to you`,
              line: `${me.name.toLowerCase()} replied: "${String(text).trim().slice(0, 120)}"`,
              ctaLabel: "reply back",
            })
          }
        }
        // @mentions: email whoever was tagged, by name or instagram handle
        const tags = [...new Set((String(text).match(/@([\w.]{2,30})/g) || []).map((x) => x.slice(1).toLowerCase()))].slice(0, 5)
        if (tags.length) {
          const { data: people } = await db.from("members").select("member_no, name, ig").eq("banned", false).lt("member_no", "900")
          const hit = new Set()
          for (const p of people || []) {
            const handle = String(p.ig || "").replace(/^@+/, "").toLowerCase()
            const first = String(p.name || "").trim().split(/\s+/)[0].toLowerCase()
            if (tags.includes(handle) || tags.includes(first)) hit.add(p.member_no)
          }
          hit.delete(me.memberNo)
          for (const no of hit) {
            notifyMemberNo(no, {
              subject: `${me.name.toLowerCase()} mentioned you`,
              line: `${me.name.toLowerCase()}: "${String(text).trim().slice(0, 120)}"`,
              ctaLabel: "open the chat",
            })
          }
        }
        return res.status(200).json({ ok: true })
      }

      // remaining actions operate on an existing message
      const msgId = parseInt(id)
      if (!msgId) return res.status(400).json({ error: "id required" })
      const { data: row, error: ge } = await db.from("messages").select("*").eq("id", msgId).single()
      if (ge || !row) return res.status(404).json({ error: "not found" })
      if (!(await canAccess(row.channel, me))) return res.status(403).json({ error: "no access" })

      if (action === "react") {
        const em = String(emoji || "").slice(0, 8)
        if (!em) return res.status(400).json({ error: "emoji required" })
        const reactions = { ...(row.reactions || {}) }
        const who = new Set(reactions[em] || [])
        who.has(me.memberNo) ? who.delete(me.memberNo) : who.add(me.memberNo)
        if (who.size) reactions[em] = [...who]
        else delete reactions[em]
        const { error } = await db.from("messages").update({ reactions }).eq("id", msgId)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      if (action === "edit" || action === "delete") {
        if (row.from_member_no !== me.memberNo) return res.status(403).json({ error: "not yours" })
        const patch =
          action === "edit"
            ? { body: String(text || "").trim().slice(0, 1000), edited: true }
            : { deleted: true, body: "" }
        if (action === "edit" && !patch.body) return res.status(400).json({ error: "empty" })
        const { error } = await db.from("messages").update(patch).eq("id", msgId)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ error: "unknown action" })
    }

    return res.status(405).json({ error: "method not allowed" })
  } catch (e) {
    console.error("messages error:", e)
    return res.status(500).json({ error: "messages failed" })
  }
}
