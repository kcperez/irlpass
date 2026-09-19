import { db } from "./_db.js"
import { sendEmail, datesEmail } from "./_email.js"
import { foundingLeft } from "./_access.js"

// admin-only: the v2 relaunch email. ?key=ADMIN_KEY&to=<email,email> for a test,
// or &to=all to reach every member who hasn't opted out. always reports who it sent to.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const key = req.query?.key
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "unauthorized" })

  const to = String(req.query?.to || "").trim()
  if (!to) return res.status(400).json({ error: "to=<emails> or to=all" })

  try {
    const slotsLeft = await foundingLeft()
    const { count: memberCount } = await db
      .from("members")
      .select("member_no", { count: "exact", head: true })
      .lt("member_no", "900")
    let members = []
    if (to === "all") {
      const { data } = await db
        .from("members")
        .select("member_no, name, email, token, notify, banned")
        .lt("member_no", "900")
      members = (data || []).filter((m) => m.email && m.notify && !m.banned)
    } else {
      const wanted = to.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
      const { data } = await db.from("members").select("member_no, name, email, token").in("email", wanted)
      members = data || []
    }

    const sent = []
    const failed = []
    for (const m of members) {
      const mail = await sendEmail({
        to: m.email,
        ...datesEmail({
          name: m.name,
          memberNo: m.member_no,
          slotsLeft,
          members: memberCount || 182,
          url: `https://irlpass.xyz/?screen=app&t=${m.token}`,
          unsub: `https://irlpass.xyz/api/notify-off?t=${m.token}`,
        }),
      })
      ;(mail.sent ? sent : failed).push(m.email)
      await new Promise((r) => setTimeout(r, 600)) // resend rate limit
    }
    return res.status(200).json({ count: members.length, sent, failed, slotsLeft })
  } catch (e) {
    console.error("blast error:", e)
    return res.status(500).json({ error: "blast failed" })
  }
}
