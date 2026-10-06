import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// the chat badge: just a count, two small queries (the full inbox was being
// loaded every 30s only to add up a number)
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const { data: threads } = await db.from("dm_threads").select("id").or(`a_no.eq.${me.memberNo},b_no.eq.${me.memberNo}`)
  if (!threads?.length) return res.status(200).json({ dms: 0 })
  const { count } = await db
    .from("dm_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threads.map((x) => x.id))
    .neq("from_no", me.memberNo)
    .is("read_at", null)
  res.setHeader("cache-control", "no-store")
  return res.status(200).json({ dms: count || 0 })
}
