import { getMember } from "./_lib.js"
import { db } from "./_db.js"

// channels: "medellin" (lobby, all members) or an activity id (joined members only)
async function canAccess(channel, me) {
  if (channel === "medellin") return true
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
  const me = await getMember(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const channel = String(req.query?.channel || "medellin")
      if (!(await canAccess(channel, me))) return res.status(403).json({ error: "join first" })
      const { data, error } = await db
        .from("messages")
        .select("*")
        .eq("channel", channel)
        .order("id", { ascending: true })
        .limit(150)
      if (error) throw error
      return res.status(200).json({ messages: data.map(rowToMsg) })
    }

    if (req.method === "POST") {
      const { action = "send", channel: ch, text, id, emoji, replyTo } = req.body || {}
      const channel = String(ch || "medellin")

      if (action === "send") {
        if (!text || !String(text).trim()) return res.status(400).json({ error: "empty" })
        if (!(await canAccess(channel, me))) return res.status(403).json({ error: "join first" })
        const { error } = await db.from("messages").insert({
          channel,
          body: String(text).trim().slice(0, 1000),
          from_name: me.name,
          from_ig: me.ig,
          from_member_no: me.memberNo,
          reply_to: Number.isInteger(replyTo) ? replyTo : null,
        })
        if (error) throw error
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
