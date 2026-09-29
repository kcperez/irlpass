import { db } from "./_db.js"
import { sendEmail, loginEmail } from "./_email.js"
import { loginCode } from "./_logincode.js"

// POST { ig } -> is this instagram already a member? if so, email them a link
// that opens the app and return a masked hint of where it went. returning
// members typed their handle on the homepage and got walked through signup
// again with "nowhere to go"; this sends them home instead.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const handle = String(req.body?.ig || "").trim().replace(/^@+/, "").toLowerCase().slice(0, 60)
  if (handle.length < 2) return res.status(400).json({ error: "which instagram?" })

  try {
    const { data: m } = await db
      .from("members")
      .select("name, email, token, banned")
      // ilike for case, with _ and % escaped so a handle can't match someone else's
      .ilike("ig", `@${handle.replace(/[\\%_]/g, (c) => `\\${c}`)}`)
      .lt("member_no", "900")
      .limit(1)
      .maybeSingle()
    if (!m || m.banned || !m.email) return res.status(200).json({ member: false })

    await sendEmail({
      to: m.email,
      ...loginEmail({ name: m.name, url: `https://irlpass.xyz/?screen=app&t=${m.token}`, label: "open irlpass", code: loginCode(m.email, m.token) }),
    })
    return res.status(200).json({ member: true, hint: mask(m.email) })
  } catch (e) {
    console.error("handle-login error:", e)
    return res.status(200).json({ member: false })
  }
}

// k•••@gmail.com
const mask = (email) => {
  const [user, domain] = String(email).split("@")
  return `${user.slice(0, 1)}•••@${domain}`
}
