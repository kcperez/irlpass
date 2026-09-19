import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// DELETE ?t= -> remove the member and everything attached to them.
// Permanent by design: nobody should have to email us to disappear.
export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    const no = me.memberNo
    await db.from("trips").delete().eq("member_no", no)
    await db.from("unlocks").delete().eq("member_no", no)
    await db.from("dm_messages").delete().eq("from_no", no)
    await db.from("dm_threads").delete().or(`a_no.eq.${no},b_no.eq.${no}`)
    await db.from("messages").delete().eq("from_member_no", no)
    await db.from("reviews").delete().or(`reviewer_no.eq.${no},target_no.eq.${no}`)
    await db.from("members").delete().eq("member_no", no)
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("account delete error:", e)
    return res.status(500).json({ error: "could not delete the account" })
  }
}
