import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// GET ?t=&ids=1,2,3 -> { photos: { id: url } }: the shuffle polls this while a
// fresh city's cards are still getting their pictures
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const ids = String(req.query?.ids || "").split(",").map(Number).filter(Boolean).slice(0, 12)
  if (!ids.length) return res.status(200).json({ photos: {} })
  const { data } = await db.from("spots").select("id, photos, rating").in("id", ids)
  const photos = {}
  for (const r of data || []) if (Array.isArray(r.photos) && r.photos[0]) photos[r.id] = { photo: r.photos[0], rating: r.rating }
  res.setHeader("cache-control", "no-store")
  return res.status(200).json({ photos })
}
