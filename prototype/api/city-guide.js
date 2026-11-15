import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { askCity } from "./_search.js"

// the city tab's "eat & drink": the guide-ranked places for a city, worked out
// once and kept for a few days (app_settings guide:<city>) so opening the tab
// is instant and costs nothing.
// GET ?t&city -> { places, at }
export const config = { maxDuration: 60 }
const KEEP = 3 * 864e5
const ASK = "the best places to eat and drink right now: michelin picks first (stars, bib gourmand, selected), then the local favourites people line up for. a mix of dinner, casual, coffee and a bar."

export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const city = String(req.query?.city || me.city || "medellin").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 40)
  const lang = req.query?.lang === "es" ? "es" : "en"
  const key = lang === "es" ? `guide:${city}:es` : `guide:${city}`
  const { data: row } = await db.from("app_settings").select("value").eq("key", key).maybeSingle()
  let cached = null
  try { cached = row?.value ? JSON.parse(row.value) : null } catch { cached = null }
  // a guide built before the google key existed has no photos or ratings: rebuild it once the key is there
  const preGoogle = process.env.GOOGLE_MAPS_KEY && cached?.places?.length && !cached.places.some((p) => p.rating)
  if (cached?.places?.length && Date.now() - cached.at < KEEP && !preGoogle) {
    res.setHeader("cache-control", "private, max-age=600")
    return res.status(200).json(cached)
  }
  const out = await askCity(city, ASK, lang)
  if (out.error || !out.places?.length) return res.status(200).json(cached || { places: [], at: 0 })
  const fresh = { places: out.places, at: Date.now() }
  await db.from("app_settings").upsert({ key, value: JSON.stringify(fresh) }).then(() => {}, () => {})
  return res.status(200).json(fresh)
}
