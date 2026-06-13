import { list } from "@vercel/blob"
import { readJson } from "./_lib.js"
import { db } from "./_db.js"

// POST { jwt } from a supabase google sign-in -> where does this email stand?
// returns { state: "member"|"accepted"|"applied"|"none", url?, name? }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const { jwt } = req.body || {}
  if (!jwt) return res.status(400).json({ error: "jwt required" })

  try {
    // let supabase verify the token and hand us the verified identity
    const u = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${jwt}`, apikey: process.env.SUPABASE_SERVICE_KEY },
    })
    if (!u.ok) return res.status(401).json({ error: "bad session" })
    const user = await u.json()
    const email = String(user.email || "").toLowerCase()
    if (!email) return res.status(401).json({ error: "no email" })

    const { data: m } = await db.from("members").select("*").eq("email", email).maybeSingle()
    if (m && !m.banned) {
      if (m.paid) {
        return res.status(200).json({ state: "member", name: m.name, url: `/?screen=app&t=${m.token}` })
      }
      return res.status(200).json({ state: "accepted", name: m.name, url: `/?screen=offer&t=${m.token}` })
    }

    // not accepted yet: do they have an application in?
    const { blobs } = await list({ prefix: "applications/", limit: 1000 })
    for (const b of blobs) {
      const a = await readJson(b.pathname)
      if (a && String(a.email).toLowerCase() === email) {
        return res.status(200).json({ state: "applied", name: a.name })
      }
    }
    return res.status(200).json({ state: "none" })
  } catch (e) {
    console.error("whoami error:", e)
    return res.status(500).json({ error: "whoami failed" })
  }
}
