import { randomBytes } from "node:crypto"
import { db } from "./_db.js"
import { sendEmail, acceptanceEmail } from "./_email.js"

// First two member numbers belong to the founders; applicants start at 003.
const MEMBER_START = 3

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const key = req.query?.key
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }

  try {
    const { name, ig, email } = req.body || {}
    if (!name || !ig || !email) {
      return res.status(400).json({ error: "name, ig, email required" })
    }

    // idempotent: re-accepting the same instagram returns the existing offer link
    const cleanIg = String(ig).trim().slice(0, 80)
    const { data: existing } = await db.from("members").select("*").eq("ig", cleanIg).maybeSingle()
    if (existing) {
      return res.status(200).json({
        ok: true,
        memberNo: existing.member_no,
        url: `https://irlpass.xyz/?screen=offer&t=${existing.token}`,
        note: "already accepted, same link returned",
      })
    }

    const { count } = await db.from("members").select("*", { count: "exact", head: true })
    const memberNo = String(MEMBER_START + (count || 0)).padStart(3, "0")
    const token = randomBytes(16).toString("hex")

    const cleanEmail = String(email).trim().toLowerCase().slice(0, 120)
    const cleanName = String(name).trim().slice(0, 80)
    const { error } = await db.from("members").insert({
      token,
      name: cleanName,
      ig: cleanIg,
      email: cleanEmail,
      member_no: memberNo,
      city: "medellin",
    })
    if (error) throw error

    const url = `https://irlpass.xyz/?screen=offer&t=${token}`
    const mail = await sendEmail({ to: cleanEmail, ...acceptanceEmail({ name: cleanName, memberNo, url }) })

    return res.status(200).json({ ok: true, memberNo, url, emailSent: mail.sent })
  } catch (e) {
    console.error("accept error:", e)
    return res.status(500).json({ error: "could not create acceptance" })
  }
}
