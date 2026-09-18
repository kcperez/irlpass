import { getUser, rowToMember } from "./_lib.js"
import { db } from "./_db.js"
import { isCity } from "./_cities.js"
import { canReach, isDate, overlaps, today } from "./_access.js"

// GET ?t=&city=&starts=&ends=  -> everyone whose dates overlap that window.
// One person comes back in the clear so the screen has a face; the rest are
// masked until this member can reach them (founding slot, pass, or unlock).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const city = String(req.query?.city || "")
  const starts = req.query?.starts
  const ends = req.query?.ends
  if (!isCity(city)) return res.status(400).json({ error: "unknown city" })
  if (!isDate(starts) || !isDate(ends) || ends < starts) return res.status(400).json({ error: "bad dates" })

  try {
    const { data: trips } = await db
      .from("trips")
      .select("*")
      .eq("city", city)
      .lte("starts", ends)
      .gte("ends", starts)
      .gte("ends", today())
      .neq("member_no", me.memberNo)
      .limit(120)

    const rows = (trips || []).filter((t) => overlaps(t.starts, t.ends, starts, ends))
    const access = await canReach(me, city, starts, ends)

    // members i already have a thread with are never masked
    const { data: threads } = await db
      .from("dm_threads")
      .select("a_no, b_no")
      .or(`a_no.eq.${me.memberNo},b_no.eq.${me.memberNo}`)
    const known = new Set((threads || []).map((t) => (t.a_no === me.memberNo ? t.b_no : t.a_no)))

    const nos = [...new Set(rows.map((t) => t.member_no))]
    const { data: memberRows } = await db.from("members").select("*").in("member_no", nos.length ? nos : ["-"])
    const byNo = new Map((memberRows || []).map((r) => [r.member_no, rowToMember(r)]))

    const people = []
    for (const t of rows) {
      const m = byNo.get(t.member_no)
      if (!m || m.banned) continue
      // safety: a member who only accepts women/non-binary dms stays masked to men
      const blocked = me.gender === "man" && m.allowDmFromMen === false
      const open = access.ok || known.has(m.memberNo)
      people.push({
        memberNo: m.memberNo,
        first: firstName(m.name),
        name: open ? m.name : null,
        ig: open && (m.showIgToMen || me.gender !== "man") ? m.ig : null,
        photo: open ? m.photo : null,
        gender: m.gender,
        verified: m.verified,
        repScore: m.repScore,
        repCount: m.repCount,
        interests: open ? m.interests : (m.interests || []).slice(0, 2),
        starts: t.starts,
        ends: t.ends,
        flexible: !!t.flexible,
        note: open ? t.note || "" : "",
        locked: !open,
        canMessage: open && !blocked,
        womenOnly: m.allowDmFromMen === false,
      })
    }

    // show the freshest face first, and put one unlocked person up top when
    // everything is locked so the screen is never a wall of blur
    people.sort((a, b) => (a.starts < b.starts ? -1 : a.starts > b.starts ? 1 : 0))
    if (!access.ok && people.length) {
      const teaser = people.find((p) => !p.womenOnly) || people[0]
      teaser.locked = false
      teaser.name = byNo.get(teaser.memberNo)?.name || teaser.first
      teaser.photo = byNo.get(teaser.memberNo)?.photo || null
      teaser.teaser = true
      teaser.canMessage = false // you can see them; the first message is the paywall
    }

    return res.status(200).json({
      city,
      starts,
      ends,
      access: access.via, // 'founding' | 'pass' | 'unlock' | null
      count: people.length,
      women: people.filter((p) => p.gender === "woman").length,
      people,
    })
  } catch (e) {
    console.error("overlap error:", e)
    return res.status(500).json({ error: "could not load who's around" })
  }
}

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "someone"
