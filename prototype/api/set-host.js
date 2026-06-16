import { db } from "./_db.js"

// admin: /api/set-host?key=ADMIN_KEY&no=003&on=1  (on=0 to revoke)
export default async function handler(req, res) {
  const { key, no, on } = req.query || {}
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }
  if (!no) return res.status(400).json({ error: "pass &no=memberNo" })
  try {
    const { data, error } = await db
      .from("members")
      .update({ can_host: on !== "0" })
      .eq("member_no", String(no).padStart(3, "0"))
      .select()
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: "member not found" })
    return res.status(200).json({ ok: true, member: data.name, can_host: data.can_host })
  } catch (e) {
    console.error("set-host error:", e)
    return res.status(500).json({ error: "failed" })
  }
}
