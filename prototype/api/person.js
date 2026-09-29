import { getUser, lockedPhoto, rowToMember, safeFirstName } from "./_lib.js"
import { db } from "./_db.js"
import { canReachMember, today } from "./_access.js"
import { actsAsMod } from "./_mods.js"
import { dmState } from "./_dmstate.js"
import { cityLabel } from "./_cities.js"
import { tonight } from "./mood.js"

// GET ?t=&no= -> one member's profile: who they are, where they're from, their
// upcoming dates, their vibes, whether they're out tonight. same preview rules
// as the lists: full name, photo and instagram only once you can message them.
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const no = String(req.query?.no || "")
  if (!/^\d{3}$/.test(no)) return res.status(400).json({ error: "who?" })

  try {
    const { data: row } = await db.from("members").select("*").eq("member_no", no).maybeSingle()
    const m = rowToMember(row)
    if (!m || m.banned) return res.status(404).json({ error: "not found" })

    const self = no === me.memberNo
    const dms = await dmState(me.memberNo)
    const reach = self ? { ok: true } : await canReachMember(me, no).catch(() => ({ ok: false }))
    const open = self || actsAsMod(me) || reach.ok || dms.get(no)?.talked
    const blocked = me.gender === "man" && m.allowDmFromMen === false

    const [{ data: trips }, { data: out }, { data: going }] = await Promise.all([
      db.from("trips").select("city, starts, ends, local, flexible, area").eq("member_no", no).order("starts"),
      db.from("presence").select("area, expires_at").eq("member_no", no).gt("expires_at", new Date().toISOString()).maybeSingle(),
      db.from("spot_going").select("spot_id").eq("member_no", no).eq("night", tonight()),
    ])
    const { data: spots } = going?.length ? await db.from("spots").select("name, area").in("id", going.map((g) => g.spot_id)) : { data: [] }

    const upcoming = (trips || []).filter((t) => t.ends >= today())
    const past = [...new Set((trips || []).filter((t) => t.ends < today()).map((t) => t.city))]
    const mine = new Set((me.interests || []).map((x) => String(x).toLowerCase()))

    return res.status(200).json({
      memberNo: no,
      first: open ? String(m.name || "").split(/\s+/)[0] : safeFirstName(m.name, m.ig),
      name: open ? m.name : null,
      ig: open && (m.showIgToMen || me.gender !== "man") ? m.ig : null,
      photo: open ? m.photo : lockedPhoto(m.photo),
      locked: !open,
      verified: m.verified,
      country: m.country || null,
      home: m.homeCity ? cityLabel(m.homeCity) : null,
      since: row.accepted_at || null,
      vibes: m.interests || [],
      shared: (m.interests || []).filter((x) => mine.has(String(x).toLowerCase())),
      trips: upcoming.map((t) => ({
        city: t.city,
        cityName: cityLabel(t.city),
        starts: t.starts,
        ends: t.ends,
        local: !!t.local,
        flexible: !!t.flexible,
        area: open ? t.area || "" : "",
      })),
      been: past.map(cityLabel),
      out: out || spots?.length ? { area: out?.area || spots?.[0]?.area || "", spots: (spots || []).map((s) => s.name) } : null,
      canMessage: !self && open && !blocked,
      talked: !!dms.get(no)?.talked,
      self,
    })
  } catch (e) {
    console.error("person error:", e)
    return res.status(500).json({ error: "could not load them" })
  }
}
