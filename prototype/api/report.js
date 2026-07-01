import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// POST { t, targetType, targetId, reason }
//   private safety flag on a user or an activity. never shown publicly — only
//   the trust & safety queue (Admin) sees it. protects the reporter.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const { targetType, targetId, reason } = req.body || {}
  if (!["user", "activity"].includes(targetType)) return res.status(400).json({ error: "bad target type" })
  if (!targetId || !String(targetId).trim()) return res.status(400).json({ error: "target required" })

  try {
    const { error } = await db.from("reports").insert({
      reporter_no: me.memberNo,
      target_type: targetType,
      target_id: String(targetId).slice(0, 64),
      reason: reason ? String(reason).slice(0, 500) : null,
    })
    if (error) throw error
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("report error:", e)
    return res.status(500).json({ error: "could not file report" })
  }
}
