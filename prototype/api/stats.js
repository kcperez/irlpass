import { db } from "./_db.js"
import { today } from "./_access.js"

// public counts for the front door. real numbers only — no names, no faces.
export default async function handler(req, res) {
  try {
    const { count: members } = await db
      .from("members")
      .select("member_no", { count: "exact", head: true })
      .lt("member_no", "900")
      .eq("banned", false)

    const { data: trips } = await db
      .from("trips")
      .select("city, member_no")
      .gte("ends", today())

    // people with dates up, per city — this is what makes a chip glow
    const byCity = {}
    for (const t of trips || []) {
      byCity[t.city] = byCity[t.city] || new Set()
      byCity[t.city].add(t.member_no)
    }
    const counts = Object.fromEntries(Object.entries(byCity).map(([c, set]) => [c, set.size]))
    const cities = Object.keys(counts)
    const travelling = new Set((trips || []).map((t) => t.member_no)).size

    res.setHeader("cache-control", "public, s-maxage=120, stale-while-revalidate=600")
    return res.status(200).json({
      members: members || 0,
      travelling,          // members with dates up right now
      cities: cities.length,
      byCity: counts,
    })
  } catch (e) {
    console.error("stats error:", e)
    return res.status(200).json({ members: 0, travelling: 0, cities: 0 })
  }
}
