import { getAccepted } from "./_lib.js"

export default async function handler(req, res) {
  const m = await getAccepted(req.query?.t)
  if (!m || m.banned) return res.status(404).json({ error: "not found" })
  return res.status(200).json({ name: m.name, memberNo: m.memberNo, city: m.city, paid: m.paid })
}
