import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { canonicalCity, cityLabel } from "./_cities.js"

// Josh's ask: every "is this in ___" is roadmap data and right now it
// evaporates. POST { t, city } logs one. GET (mods only) reads the tally.
export default async function handler(req, res) {
  const me = await getUser(req.method === "POST" ? req.body?.t : req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  if (req.method === "POST") {
    const raw = String(req.body?.city || "").trim()
    if (!raw || raw.length > 60) return res.status(400).json({ error: "which city?" })
    const city = canonicalCity(raw)
    try {
      await db.from("city_requests").insert({
        city,
        member_no: me.memberNo,
        source: String(req.body?.source || "app").slice(0, 20),
      })
      return res.status(200).json({ ok: true, city, label: cityLabel(city) })
    } catch (e) {
      console.error("city request error:", e)
      return res.status(500).json({ error: "could not save that" })
    }
  }

  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" })

  const { data } = await db.from("city_requests").select("city, member_no, created_at")
  const tally = {}
  for (const r of data || []) {
    tally[r.city] = tally[r.city] || { city: r.city, label: cityLabel(r.city), asks: 0, people: new Set() }
    tally[r.city].asks++
    if (r.member_no) tally[r.city].people.add(r.member_no)
  }
  const cities = Object.values(tally)
    .map((c) => ({ city: c.city, label: c.label, asks: c.asks, people: c.people.size }))
    .sort((a, b) => b.people - a.people || b.asks - a.asks)
  return res.status(200).json({ total: (data || []).length, cities })
}
