import { db } from "./_db.js"
import { isCity } from "./_cities.js"
import { isDate, overlaps, today, foundingLeft } from "./_access.js"

// No token needed: this is the reveal a brand new person sees before they hand
// over anything. Counts are real, faces come back masked.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const { city, starts, ends } = req.body || {}
  if (!isCity(city)) return res.status(400).json({ error: "unknown city" })
  if (!isDate(starts) || !isDate(ends) || ends < starts) return res.status(400).json({ error: "bad dates" })

  try {
    const { data: trips } = await db
      .from("trips")
      .select("member_no, starts, ends")
      .eq("city", city)
      .lte("starts", ends)
      .gte("ends", starts)
      .gte("ends", today())
      .limit(200)

    const rows = (trips || []).filter((t) => overlaps(t.starts, t.ends, starts, ends))
    const nos = [...new Set(rows.map((t) => t.member_no))]

    let people = []
    if (nos.length) {
      const { data: members } = await db
        .from("members")
        .select("member_no, name, photo_url, gender, banned")
        .in("member_no", nos)
      people = (members || [])
        .filter((m) => !m.banned)
        .map((m) => ({
          first: String(m.name || "").trim().split(/\s+/)[0] || "someone",
          photo: m.photo_url || null,
          gender: m.gender || null,
        }))
    }

    // people who live in that city count too: they are who you'd meet anyway
    const { count: inCity } = await db
      .from("members")
      .select("member_no", { count: "exact", head: true })
      .eq("city", city)
      .lt("member_no", "900")

    // how many land on the same day you do — the line that makes it feel real
    const sameDay = rows.filter((t) => t.starts === starts).length

    return res.status(200).json({
      city,
      starts,
      ends,
      count: people.length,
      women: people.filter((p) => p.gender === "woman").length,
      men: people.filter((p) => p.gender === "man").length,
      sameDay,
      inCity: inCity || 0,
      faces: people.slice(0, 8).map((p) => ({ first: p.first, photo: p.photo })),
      foundingLeft: await foundingLeft(),
    })
  } catch (e) {
    console.error("preview error:", e)
    return res.status(500).json({ error: "could not look that up" })
  }
}
