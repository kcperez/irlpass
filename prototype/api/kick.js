import { db } from "./_db.js"

// admin: /api/kick?key=ADMIN_KEY&no=004  (add &unban=1 to reverse)
export default async function handler(req, res) {
  const { key, no, unban } = req.query || {}
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }
  if (!no) return res.status(400).json({ error: "pass &no=memberNo" })

  try {
    const banned = !unban
    const memberNo = String(no).padStart(3, "0")
    const { data, error } = await db
      .from("members")
      .update({ banned })
      .eq("member_no", memberNo)
      .select()
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: "member not found" })
    return res.status(200).json({
      ok: true,
      member: data.name,
      ig: data.ig,
      banned,
      note: banned ? "takes effect immediately. also cancel their subscription in the stripe dashboard" : "restored",
    })
  } catch (e) {
    console.error("kick error:", e)
    return res.status(500).json({ error: "kick failed" })
  }
}
