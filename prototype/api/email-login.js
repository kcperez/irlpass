import { list } from "@vercel/blob"
import { readJson } from "./_lib.js"
import { db } from "./_db.js"
import { sendEmail, loginEmail } from "./_email.js"
import { loginCode } from "./_logincode.js"

// POST { email } -> mails the right link for their state. always returns ok (no fishing)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const email = String(req.body?.email || "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "bad email" })

  try {
    const { data: m } = await db.from("members").select("*").eq("email", email).maybeSingle()
    if (m && !m.banned) {
      // freemium: everyone accepted gets the app link. no more unpaid -> offer wall.
      const url = `https://irlpass.xyz/?screen=app&t=${m.token}`
      const sent = await sendEmail({
        to: email,
        ...loginEmail({ name: m.name, url, label: "open irlpass", code: loginCode(email, m.token) }),
      })
      // a member whose email didn't go out hears about it, so they can retry
      if (!sent.sent) return res.status(502).json({ error: "we couldn't send the email. try again in a minute." })
    } else {
      const { blobs } = await list({ prefix: "applications/", limit: 1000 })
      for (const b of blobs) {
        const a = await readJson(b.pathname)
        if (a && String(a.email).toLowerCase() === email) {
          await sendEmail({
            to: email,
            ...loginEmail({ name: a.name, url: "https://irlpass.xyz/?screen=auth&s=applied&name=" + encodeURIComponent(a.name || ""), label: "check your application status" }),
          })
          break
        }
      }
    }
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("email-login error:", e)
    return res.status(200).json({ ok: true })
  }
}
