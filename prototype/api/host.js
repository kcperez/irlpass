import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// "yes, i want to host": josh follows up with each one by hand. the range is
// what they'd want to earn per night, so we learn host expectations first.
export const EARN_RANGES = ["under $50", "$50-100", "$100-200", "$200+"]

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  if (req.method === "GET") {
    const { data } = await db.from("host_interest").select("earn_range, note").eq("member_no", me.memberNo).maybeSingle()
    return res.status(200).json({ ranges: EARN_RANGES, mine: data || null })
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const earn = EARN_RANGES.includes(req.body?.earn) ? req.body.earn : null
  if (!earn) return res.status(400).json({ error: "pick a range" })
  const note = String(req.body?.note || "").trim().slice(0, 300) || null
  const { error } = await db.from("host_interest").upsert({ member_no: me.memberNo, earn_range: earn, note }, { onConflict: "member_no" })
  if (error) return res.status(500).json({ error: "couldn't save that" })
  return res.status(200).json({ ok: true })
}
