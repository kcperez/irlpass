import { getUser, lockedPhoto, safeFirstName, rowToMember } from "./_lib.js"
import { db } from "./_db.js"
import { canReach } from "./_access.js"
import { actsAsMod } from "./_mods.js"

// the mood tab (josh's EDC sprint): pick tonight's mood, see the hand-picked
// spots for it, tap "i'm going tonight", see who else is going, and drop an
// "i'm out in [neighborhood]" status that expires.
//
// GET  ?t=&city=               -> { mood, board: {pregame, afters, chill}, going, presence }
// POST { t, action: "mood", mood }
// POST { t, action: "going", spotId, on }
// POST { t, action: "out", area } | { t, action: "out", off: true }
// POST { t, action: "spot", ... }  (mods: add / edit / hide a spot)

export const MOODS = ["pregame", "afters", "chill"]
const OUT_HOURS = 4

// "tonight" runs until 6am medellín time, so an afters crowd at 2am is still tonight
export const tonight = () => {
  const now = new Date(Date.now() - 5 * 3600e3 - 6 * 3600e3) // utc-5, then back 6h
  return now.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const night = tonight()

  try {
    if (req.method === "GET") {
      const city = String(req.query?.city || "medellin")
      const [{ data: spots }, { data: going }, { data: myMood }, { data: out }] = await Promise.all([
        db.from("spots").select("*").eq("city", city).eq("active", true).order("sort").order("id"),
        db.from("spot_going").select("spot_id, member_no").eq("night", night),
        db.from("moods").select("mood").eq("member_no", me.memberNo).eq("night", night).maybeSingle(),
        db.from("presence").select("*").eq("city", city).gt("expires_at", new Date().toISOString()),
      ])

      // everyone we need to draw: people going somewhere tonight + people out
      const nos = [...new Set([...(going || []).map((g) => g.member_no), ...(out || []).map((p) => p.member_no)])]
      const { data: rows } = nos.length ? await db.from("members").select("*").in("member_no", nos) : { data: [] }
      const byNo = new Map((rows || []).map((r) => [r.member_no, rowToMember(r)]).filter(([, m]) => m && !m.banned))

      // tonight is a shared plan, so the same rules as dates: people you've
      // talked to or can reach are in the clear, everyone else is a preview
      const access = await canReach(me, city, night, night)
      const { data: threads } = await db.from("dm_threads").select("a_no, b_no").or(`a_no.eq.${me.memberNo},b_no.eq.${me.memberNo}`)
      const known = new Set((threads || []).map((t) => (t.a_no === me.memberNo ? t.b_no : t.a_no)))
      const mineSet = new Set((me.interests || []).map((x) => String(x).toLowerCase()))
      const face = (no) => {
        const m = byNo.get(no)
        if (!m) return null
        const open = no === me.memberNo || access.ok || known.has(no) || actsAsMod(me)
        return {
          memberNo: no,
          first: open ? String(m.name || "").split(/\s+/)[0] : safeFirstName(m.name, m.ig),
          name: open ? m.name : null,
          photo: open ? m.photo : lockedPhoto(m.photo),
          locked: !open,
          me: no === me.memberNo,
          shared: (m.interests || []).filter((x) => mineSet.has(String(x).toLowerCase())).slice(0, 3),
        }
      }

      const goingBySpot = {}
      for (const g of going || []) (goingBySpot[g.spot_id] = goingBySpot[g.spot_id] || []).push(g.member_no)

      const board = Object.fromEntries(MOODS.map((mood) => [mood, []]))
      for (const s of spots || []) {
        if (!board[s.mood]) continue
        const people = (goingBySpot[s.id] || []).map(face).filter(Boolean)
          .sort((a, b) => b.me - a.me || b.shared.length - a.shared.length)
        board[s.mood].push({
          id: s.id,
          name: s.name,
          area: s.area || "",
          kind: s.kind || "",
          tag: s.tag || "",
          going: people.length,
          people: people.slice(0, 8),
          imGoing: people.some((p) => p.me),
          room: `spot-${s.id}-${night.replace(/-/g, "")}`,
        })
      }

      return res.status(200).json({
        night,
        mood: myMood?.mood || null,
        board,
        presence: (out || []).map((p) => ({ ...face(p.member_no), area: p.area, until: p.expires_at })).filter((p) => p.memberNo),
        myOut: (out || []).find((p) => p.member_no === me.memberNo) || null,
      })
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const { action } = req.body || {}

    if (action === "mood") {
      const mood = String(req.body?.mood || "")
      if (!MOODS.includes(mood)) return res.status(400).json({ error: "pick a mood" })
      await db.from("moods").upsert(
        { member_no: me.memberNo, night, mood, city: "medellin", updated_at: new Date().toISOString() },
        { onConflict: "member_no,night" }
      )
      return res.status(200).json({ ok: true, mood })
    }

    if (action === "going") {
      const spotId = Number(req.body?.spotId)
      if (!spotId) return res.status(400).json({ error: "which spot?" })
      if (req.body?.on === false) {
        await db.from("spot_going").delete().eq("spot_id", spotId).eq("member_no", me.memberNo).eq("night", night)
      } else {
        await db.from("spot_going").upsert({ spot_id: spotId, member_no: me.memberNo, night }, { onConflict: "spot_id,member_no,night" })
      }
      return res.status(200).json({ ok: true })
    }

    if (action === "out") {
      if (req.body?.off) {
        await db.from("presence").delete().eq("member_no", me.memberNo)
        return res.status(200).json({ ok: true, out: null })
      }
      // neighborhood only: no digits (addresses), short
      const area = String(req.body?.area || "").replace(/[0-9#]/g, "").replace(/\s+/g, " ").trim().slice(0, 40)
      if (!area) return res.status(400).json({ error: "which neighborhood?" })
      const row = {
        member_no: me.memberNo,
        city: "medellin",
        area,
        expires_at: new Date(Date.now() + OUT_HOURS * 3600e3).toISOString(),
        created_at: new Date().toISOString(),
      }
      await db.from("presence").upsert(row, { onConflict: "member_no" })
      return res.status(200).json({ ok: true, out: row })
    }

    // mods curate the board from ops
    if (action === "spot") {
      if (!actsAsMod(me)) return res.status(403).json({ error: "mods only" })
      const { id, name, area, kind, tag, mood, sort, active } = req.body || {}
      const patch = {}
      if (name !== undefined) patch.name = String(name).trim().slice(0, 60)
      if (area !== undefined) patch.area = String(area).trim().slice(0, 40) || null
      if (kind !== undefined) patch.kind = String(kind).trim().slice(0, 30) || null
      if (tag !== undefined) patch.tag = String(tag).trim().slice(0, 20) || null
      if (mood !== undefined) {
        if (!MOODS.includes(mood)) return res.status(400).json({ error: "mood must be pregame, afters or chill" })
        patch.mood = mood
      }
      if (sort !== undefined) patch.sort = Number(sort) || 100
      if (active !== undefined) patch.active = !!active
      if (id) {
        const { error } = await db.from("spots").update(patch).eq("id", Number(id))
        if (error) throw error
      } else {
        if (!patch.name || !patch.mood) return res.status(400).json({ error: "a spot needs a name and a mood" })
        const { error } = await db.from("spots").insert({ city: "medellin", ...patch })
        if (error) throw error
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: "unknown action" })
  } catch (e) {
    console.error("mood error:", e)
    return res.status(500).json({ error: "something went wrong" })
  }
}
