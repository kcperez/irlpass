import { db } from "./_db.js"

const MAX_FAILS = 5
const LOCK_MINUTES = 60

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })

  // identify the caller; vercel puts the real client ip first in x-forwarded-for
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim()
  const now = Date.now()

  try {
    const { data: rec } = await db.from("login_attempts").select("*").eq("ip", ip).maybeSingle()

    // locked out?
    if (rec?.locked_until && new Date(rec.locked_until).getTime() > now) {
      const mins = Math.ceil((new Date(rec.locked_until).getTime() - now) / 60000)
      return res.status(429).json({ error: `too many tries. locked for ${mins} more min` })
    }

    const { pw } = req.body || {}
    const ok = process.env.ADMIN_PW && pw && pw === process.env.ADMIN_PW

    if (!ok) {
      const fails = (rec?.locked_until && new Date(rec.locked_until).getTime() <= now ? 0 : rec?.fails || 0) + 1
      const locked_until = fails >= MAX_FAILS ? new Date(now + LOCK_MINUTES * 60000).toISOString() : null
      await db.from("login_attempts").upsert({ ip, fails, locked_until, updated_at: new Date(now).toISOString() })
      const left = Math.max(0, MAX_FAILS - fails)
      return res.status(401).json({ error: locked_until ? `too many tries. locked for ${LOCK_MINUTES} min` : `wrong password · ${left} tries left` })
    }

    // success: clear the counter
    if (rec) await db.from("login_attempts").delete().eq("ip", ip)
    return res.status(200).json({ key: process.env.ADMIN_KEY })
  } catch (e) {
    console.error("login error:", e)
    return res.status(500).json({ error: "login failed" })
  }
}
