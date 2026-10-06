import { waitUntil } from "@vercel/functions"
import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { rowToMember, safeFirstName, lockedPhoto } from "./_lib.js"
import { notifyMemberNo } from "./_notify.js"
import { canReachMember } from "./_access.js"
import { isMod, actsAsMod } from "./_mods.js"

const pair = (a, b) => (String(a) < String(b) ? [String(a), String(b)] : [String(b), String(a)])

const memberByNo = async (no) => {
  const { data } = await db.from("members").select("*").eq("member_no", no).maybeSingle()
  return rowToMember(data)
}

// do these two share at least one activity? (free DM unlocks once you've been in
// a plan together — strangers cost a pass)
async function shareActivity(aNo, bNo) {
  const { data } = await db
    .from("activities")
    .select("id")
    .contains("joined", [{ memberNo: aNo }])
    .contains("joined", [{ memberNo: bNo }])
    .limit(1)
  return !!(data && data.length)
}

const lite = (m) => m && { name: m.name, ig: m.ig, memberNo: m.memberNo, photo: m.photo, verified: m.verified, repScore: m.repScore }

// GET  ?t=                 -> my threads (latest first)
// GET  ?t=&with=<no>       -> the conversation with one member (marks it read)
// POST { t, to, text }     -> send a dm (gated: shared-plan = free, stranger = pass)
export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query?.t : req.body?.t
  const me = await getUser(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const withNo = req.query?.with ? String(req.query.with) : null

      if (!withNo) {
        // inbox: every thread i'm in, with the other person + last line + unread count
        const { data: threads } = await db
          .from("dm_threads")
          .select("*")
          .or(`a_no.eq.${me.memberNo},b_no.eq.${me.memberNo}`)
          .order("last_at", { ascending: false })
          .limit(80)
        // three queries total (was three per thread, one after another, which is
        // why the chats tab dragged): the people, then every thread's messages
        const ids = (threads || []).map((th) => th.id)
        const others = [...new Set((threads || []).map((th) => (th.a_no === me.memberNo ? th.b_no : th.a_no)))]
        const [{ data: people }, { data: msgs }] = await Promise.all([
          others.length ? db.from("members").select("*").in("member_no", others) : { data: [] },
          ids.length
            ? db.from("dm_messages").select("thread_id, body, from_no, created_at, read_at, deleted").in("thread_id", ids).order("id", { ascending: false }).limit(4000)
            : { data: [] },
        ])
        const byNo = new Map((people || []).map((r) => [r.member_no, rowToMember(r)]))
        const lastOf = new Map()
        const unreadOf = new Map()
        for (const m of msgs || []) {
          if (!lastOf.has(m.thread_id)) lastOf.set(m.thread_id, m)
          if (m.from_no !== me.memberNo && !m.read_at) unreadOf.set(m.thread_id, (unreadOf.get(m.thread_id) || 0) + 1)
        }
        const out = []
        for (const th of threads || []) {
          const other = byNo.get(th.a_no === me.memberNo ? th.b_no : th.a_no)
          if (!other || other.banned) continue
          const last = lastOf.get(th.id)
          out.push({
            with: lite(other),
            last: last?.deleted ? "" : last?.body || "",
            lastFromMe: last?.from_no === me.memberNo,
            at: last?.created_at || th.last_at,
            unread: unreadOf.get(th.id) || 0,
          })
        }
        // whatsapp order: whoever wrote last is on top
        out.sort((x, y) => String(y.at).localeCompare(String(x.at)))
        return res.status(200).json({ threads: out })
      }

      const other = await memberByNo(withNo)
      if (!other) return res.status(404).json({ error: "no such member" })
      const [a, b] = pair(me.memberNo, withNo)
      const { data: th } = await db.from("dm_threads").select("id").eq("a_no", a).eq("b_no", b).maybeSingle()
      if (!th) {
        // a first message to someone you can't reach yet: you can open the chat
        // and type (the paywall fires on send), but their preview stays a preview
        const reach = actsAsMod(me) || isMod(withNo) ? { ok: true } : await canReachMember(me, withNo).catch(() => ({ ok: false }))
        const shown = reach.ok
          ? lite(other)
          : { memberNo: other.memberNo, name: safeFirstName(other.name, other.ig), ig: "", photo: lockedPhoto(other.photo), verified: other.verified, locked: true }
        return res.status(200).json({ with: shown, messages: [], canSend: reach.ok })
      }
      const { data: msgs } = await db.from("dm_messages").select("*").eq("thread_id", th.id).order("id", { ascending: false }).limit(200)
      msgs?.reverse()
      // mark their messages to me as read
      await db.from("dm_messages").update({ read_at: new Date().toISOString() }).eq("thread_id", th.id).neq("from_no", me.memberNo).is("read_at", null)
      return res.status(200).json({
        with: lite(other),
        messages: (msgs || []).map((m) => ({
          key: m.id,
          text: m.deleted ? "" : m.body,
          at: m.created_at,
          fromMe: m.from_no === me.memberNo,
          replyTo: m.reply_to || null,
          reactions: m.reactions || {},
          edited: !!m.edited,
          deleted: !!m.deleted,
        })),
      })
    }

    if (req.method === "POST") {
      const { to, text, action } = req.body || {}

      // react / edit / delete one message in a thread you're in
      if (action === "react" || action === "edit" || action === "delete") {
        const id = parseInt(req.body?.id)
        if (!id) return res.status(400).json({ error: "id required" })
        const { data: row } = await db.from("dm_messages").select("*").eq("id", id).maybeSingle()
        if (!row) return res.status(404).json({ error: "not found" })
        const { data: th } = await db.from("dm_threads").select("a_no, b_no").eq("id", row.thread_id).maybeSingle()
        if (!th || (th.a_no !== me.memberNo && th.b_no !== me.memberNo)) return res.status(403).json({ error: "no access" })
        let patch
        if (action === "react") {
          const em = String(req.body?.emoji || "").slice(0, 8)
          if (!em) return res.status(400).json({ error: "emoji required" })
          const reactions = { ...(row.reactions || {}) }
          const who = new Set(reactions[em] || [])
          who.has(me.memberNo) ? who.delete(me.memberNo) : who.add(me.memberNo)
          if (who.size) reactions[em] = [...who]
          else delete reactions[em]
          patch = { reactions }
        } else {
          if (row.from_no !== me.memberNo) return res.status(403).json({ error: "not yours" })
          patch = action === "edit"
            ? { body: String(text || "").trim().slice(0, 1000), edited: true }
            : { deleted: true }
          if (action === "edit" && !patch.body) return res.status(400).json({ error: "empty" })
        }
        const { error } = await db.from("dm_messages").update(patch).eq("id", id)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      if (!to || !String(to).trim()) return res.status(400).json({ error: "recipient required" })
      if (!text || !String(text).trim()) return res.status(400).json({ error: "empty" })
      if (String(to) === me.memberNo) return res.status(400).json({ error: "can't dm yourself" })

      const other = await memberByNo(String(to))
      if (!other) return res.status(404).json({ error: "no such member" })

      // women-safety: respect the recipient's "allow dms from men" toggle
      if (me.gender === "man" && other.allowDmFromMen === false && !actsAsMod(me)) {
        return res.status(403).json({ error: "this member only accepts dms from women & non-binary members" })
      }

      // the paywall: replying is always free, starting a conversation is not.
      // free to start when you hold a founding slot, the pass, or an unlock
      // covering their dates. legacy: sharing an activity also counts.
      const [pa, pb] = pair(me.memberNo, String(to))
      const { data: existing } = await db.from("dm_threads").select("id").eq("a_no", pa).eq("b_no", pb).maybeSingle()
      let theyWroteFirst = false
      if (existing) {
        const { count } = await db
          .from("dm_messages")
          .select("id", { count: "exact", head: true })
          .eq("thread_id", existing.id)
          .eq("from_no", String(to))
        theyWroteFirst = (count || 0) > 0
      }
      if (!theyWroteFirst && !actsAsMod(me) && !isMod(String(to))) {
        const reach = await canReachMember(me, String(to))
        const shared = reach.ok ? true : await shareActivity(me.memberNo, String(to))
        if (!reach.ok && !shared) {
          // josh's tripwire: they wrote something for someone specific. the
          // message stays in their box; the pass delivers it.
          return res.status(402).json({ error: "your message is ready. start your free month to deliver it.", gate: "deliver", to: String(to) })
        }
      }

      const [a, b] = pair(me.memberNo, String(to))
      let { data: th } = await db.from("dm_threads").select("id").eq("a_no", a).eq("b_no", b).maybeSingle()
      const now = new Date().toISOString()
      if (!th) {
        const { data: created, error } = await db.from("dm_threads").insert({ a_no: a, b_no: b, last_at: now }).select("id").single()
        if (error) throw error
        th = created
      } else {
        await db.from("dm_threads").update({ last_at: now }).eq("id", th.id)
      }
      const { error: me2 } = await db.from("dm_messages").insert({
        thread_id: th.id,
        from_no: me.memberNo,
        body: String(text).trim().slice(0, 1000),
        reply_to: Number.isInteger(req.body?.replyTo) ? req.body.replyTo : null,
      })
      if (me2) throw me2
      waitUntil(notifyMemberNo(String(to), {
        subject: `${me.name.toLowerCase()} sent you a message`,
        line: `${me.name.toLowerCase()}: "${String(text).trim().slice(0, 120)}"`,
        ctaLabel: "open your dms",
        push: { title: String(me.name || "").split(/\s+/)[0], body: String(text).trim().slice(0, 140), tag: `dm-${me.memberNo}`, go: `dm-${me.memberNo}` },
      }).catch(() => {}))
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: "method not allowed" })
  } catch (e) {
    console.error("dm error:", e)
    return res.status(500).json({ error: "dm failed" })
  }
}
