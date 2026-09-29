import { db } from "./_db.js"
import { sendEmail, datesEmail } from "./_email.js"
import { foundingLeft } from "./_access.js"

// Scheduled send. Runs from Vercel cron so no key ever leaves our own infra.
// Sends to the N newest members who haven't had the launch email yet, then
// stops. Re-running is safe: nobody is emailed twice.
const BATCH = Number(process.env.LAUNCH_BATCH || 30)

export default async function handler(req, res) {
  const auth = req.headers?.authorization || ""
  const fromVercelCron = !!req.headers?.["x-vercel-cron"]
  const manualKey = req.query?.key && req.query.key === process.env.ADMIN_KEY
  if (!fromVercelCron && !manualKey && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "not allowed" })
  }
  if (process.env.LAUNCH_EMAIL !== "on" && !manualKey) {
    return res.status(200).json({ skipped: "launch email is off" })
  }

  try {
    const { data: members } = await db
      .from("members")
      .select("member_no, name, email, token, notify, banned, launch_emailed_at")
      .lt("member_no", "900")
      .is("launch_emailed_at", null)
      .order("accepted_at", { ascending: false })
      .limit(BATCH * 3)

    const queue = (members || []).filter((m) => m.email && m.notify && !m.banned).slice(0, BATCH)
    if (!queue.length) return res.status(200).json({ sent: 0, note: "everyone already got it" })

    const slotsLeft = await foundingLeft()
    const { count: total } = await db
      .from("members")
      .select("member_no", { count: "exact", head: true })
      .lt("member_no", "900")

    const sent = []
    const failed = []
    for (const m of queue) {
      const mail = await sendEmail({
        to: m.email,
        ...datesEmail({
          name: m.name,
          memberNo: m.member_no,
          slotsLeft,
          members: total || 200,
          url: `https://irlpass.xyz/?screen=app&t=${m.token}&post=month`,
          unsub: `https://irlpass.xyz/api/notify-off?t=${m.token}`,
        }),
        unsub: `https://irlpass.xyz/api/notify-off?t=${m.token}`,
      })
      if (mail.sent) {
        sent.push(m.email)
        await db.from("members").update({ launch_emailed_at: new Date().toISOString() }).eq("member_no", m.member_no)
      } else {
        failed.push({ email: m.email, why: mail.reason })
      }
      await new Promise((r) => setTimeout(r, 600)) // resend rate limit
    }

    console.log("launch batch sent:", sent.length, "failed:", failed.length)
    return res.status(200).json({ sent: sent.length, failed, batch: BATCH })
  } catch (e) {
    console.error("cron-blast error:", e)
    return res.status(500).json({ error: "send failed" })
  }
}
