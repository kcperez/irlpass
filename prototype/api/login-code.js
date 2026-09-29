import { db } from "./_db.js"
import { codeMatches } from "./_logincode.js"

// POST { email, code } -> { token }. five wrong codes locks that email for 15 minutes.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const email = String(req.body?.email || "").trim().toLowerCase()
  const code = String(req.body?.code || "").replace(/\D/g, "")
  if (!email || code.length !== 6) return res.status(400).json({ error: "type the 6-digit code from the email" })

  const key = `code:${email}`
  const { data: rec } = await db.from("login_attempts").select("*").eq("ip", key).maybeSingle()
  if (rec?.locked_until && new Date(rec.locked_until) > new Date()) {
    return res.status(429).json({ error: "too many tries. wait 15 minutes or use the link in the email." })
  }

  const { data: m } = await db.from("members").select("token, email, banned").eq("email", email).maybeSingle()
  if (m && !m.banned && codeMatches(email, m.token, code)) {
    if (rec) await db.from("login_attempts").delete().eq("ip", key)
    return res.status(200).json({ ok: true, token: m.token })
  }

  const fails = (rec?.fails || 0) + 1
  await db.from("login_attempts").upsert({
    ip: key,
    fails,
    locked_until: fails >= 5 ? new Date(Date.now() + 15 * 60e3).toISOString() : null,
    updated_at: new Date().toISOString(),
  })
  return res.status(401).json({ error: "that code doesn't match. check the newest email." })
}
