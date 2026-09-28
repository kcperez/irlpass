import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { actsAsMod } from "./_mods.js"
import { sendEmail, edcEmail } from "./_email.js"

export const config = { maxDuration: 300 }

// the EDC weekend email to the pre-v2 list: signed up before v2 (sep 19) and
// never posted dates. mods only. GET = who'd get it (no sends). POST sends the
// next batch, and edc_emailed_at makes sure nobody gets it twice.
const V2_LAUNCH = "2026-09-19"
const BATCH = 40

async function audience() {
  const { data: members } = await db
    .from("members")
    .select("member_no, name, email, token, notify, banned, accepted_at, edc_emailed_at")
    .lt("member_no", "900")
    .lt("accepted_at", V2_LAUNCH)
  const { data: trips } = await db.from("trips").select("member_no")
  const posted = new Set((trips || []).map((t) => t.member_no))
  return (members || []).filter((m) => !m.banned && m.email && m.notify && !posted.has(m.member_no))
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!actsAsMod(me)) return res.status(401).json({ error: "mods only" })

  try {
    const all = await audience()
    const todo = all.filter((m) => !m.edc_emailed_at)
    if (req.method === "GET") return res.status(200).json({ audience: all.length, left: todo.length })

    const sent = []
    const failed = []
    for (const m of todo.slice(0, BATCH)) {
      const mail = await sendEmail({
        to: m.email,
        ...edcEmail({
          name: m.name,
          memberNo: m.member_no,
          url: `https://irlpass.xyz/?screen=app&t=${m.token}&tab=mood`,
          unsub: `https://irlpass.xyz/api/notify-off?t=${m.token}`,
        }),
      })
      if (mail.sent) {
        sent.push(m.member_no)
        await db.from("members").update({ edc_emailed_at: new Date().toISOString() }).eq("member_no", m.member_no)
      } else {
        failed.push({ memberNo: m.member_no, why: mail.reason })
      }
      await new Promise((r) => setTimeout(r, 600)) // resend rate limit
    }
    return res.status(200).json({ sent: sent.length, failed, left: todo.length - sent.length })
  } catch (e) {
    console.error("reactivate error:", e)
    return res.status(500).json({ error: "send failed" })
  }
}
