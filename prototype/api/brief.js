import { getUser } from "./_lib.js"
import { cityLabel, isValidCity } from "./_cities.js"
import { ensureBrief } from "./_brief.js"

// GET ?t=&city=slug -> { city, name, brief: { headline, sections: [{ key, title, items: [{ name?, text }] }] } }
export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const city = String(req.query?.city || "")
  if (!isValidCity(city)) return res.status(400).json({ error: "which city?" })
  try {
    const brief = await ensureBrief(city)
    if (!brief) return res.status(503).json({ error: "starter kits aren't on yet" })
    res.setHeader("cache-control", "private, max-age=3600")
    return res.status(200).json({ city, name: cityLabel(city), brief })
  } catch (e) {
    console.error("brief error:", e)
    return res.status(502).json({ error: "couldn't put that together right now" })
  }
}
