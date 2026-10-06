import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// POST { t, reason } -> one row each time the paywall shows, so ops can see
// how many hit it vs how many pay
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const reason = ["deliver", "member", "dm", "city", "shuffle", "invite"].includes(req.body?.reason) ? req.body.reason : "city"
  await db.from("paywall_events").insert({ member_no: me.memberNo, reason }).then(() => {}, () => {})
  return res.status(200).json({ ok: true })
}
