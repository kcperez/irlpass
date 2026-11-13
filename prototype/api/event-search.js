import { getUser } from "./_lib.js"
import { askCity } from "./_search.js"

// POST { t, city, q } -> { reply, ids, near, places, tip } (see _search.js)
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const q = String(req.body?.q || "").trim().slice(0, 120)
  const city = String(req.body?.city || me.city || "medellin")
  if (q.length < 2) return res.status(400).json({ error: "say what you're into" })
  const out = await askCity(city, q)
  if (out.error) return res.status(out.status || 500).json({ error: out.error })
  return res.status(200).json(out)
}
