import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { nearestCity, isCity } from "./_cities.js"

// POST { t, lat, lng } or { t, city } -> set the member's CURRENT city.
// "your current city" = where your phone physically is, which is the city you
// can join/create in for free. browsing other cities stays free; joining there
// needs a subscription. we resolve GPS to the nearest known city server-side so
// the join gate (city === me.city) can't be spoofed by the client.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  let slug = null
  const { lat, lng, city } = req.body || {}
  if (typeof lat === "number" && typeof lng === "number") {
    const c = nearestCity(lat, lng)
    slug = c?.slug || null
  } else if (isCity(city)) {
    // explicit fallback (e.g. GPS denied) — let them pick a known city by hand
    slug = String(city)
  }

  // if GPS lands nowhere near a known city, keep whatever city they had
  if (!slug) return res.status(200).json({ ok: true, city: me.city, matched: false })

  if (slug !== me.city) {
    const { error } = await db.from("members").update({ city: slug }).eq("token", me.token)
    if (error) {
      console.error("set-city error:", error)
      return res.status(500).json({ error: "could not set city" })
    }
  }
  return res.status(200).json({ ok: true, city: slug, matched: true })
}
