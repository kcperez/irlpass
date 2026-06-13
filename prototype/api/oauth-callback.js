import { list } from "@vercel/blob"
import { readJson } from "./_lib.js"
import { db } from "./_db.js"

// google redirects here with ?code -> verified email -> route by membership state
export default async function handler(req, res) {
  const go = (path) => {
    res.writeHead(302, { location: path })
    res.end()
  }
  try {
    const code = req.query?.code
    if (!code) return go("/?screen=auth&s=error")

    // exchanging the code directly with google over tls makes the id_token trustworthy
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: "https://irlpass.xyz/api/oauth-callback",
        grant_type: "authorization_code",
      }),
    })
    const tokens = await tr.json()
    if (!tokens.id_token) return go("/?screen=auth&s=error")
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString())
    const email = String(payload.email || "").toLowerCase()
    if (!email || payload.email_verified === false) return go("/?screen=auth&s=error")

    const { data: m } = await db.from("members").select("*").eq("email", email).maybeSingle()
    if (m && !m.banned) {
      if (m.paid) return go(`/?screen=app&t=${m.token}`)
      return go(`/?screen=offer&t=${m.token}`)
    }

    const { blobs } = await list({ prefix: "applications/", limit: 1000 })
    for (const b of blobs) {
      const a = await readJson(b.pathname)
      if (a && String(a.email).toLowerCase() === email) {
        return go(`/?screen=auth&s=applied&name=${encodeURIComponent(a.name || "")}`)
      }
    }
    return go("/?screen=auth&s=none")
  } catch (e) {
    console.error("oauth callback error:", e)
    return go("/?screen=auth&s=error")
  }
}
