import { db } from "./_db.js"

// admin: POST { label, maxUses } -> generates a shareable invite code (free entry)
//        GET -> lists existing codes
function makeCode() {
  const words = ["PARCE", "COMBO", "LLAVE", "PARCHE", "VECINO", "FONDA", "AREPA", "PAISA"]
  const w = words[Math.floor((Date.now() / 7) % words.length)]
  const n = Math.abs((Date.now() ^ (Date.now() >> 5)) % 9000) + 1000
  return `${w}-${n}`
}

export default async function handler(req, res) {
  const key = req.query?.key
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }
  try {
    if (req.method === "GET") {
      const { data } = await db.from("invite_codes").select("*").order("created_at", { ascending: false })
      return res.status(200).json({ codes: data || [] })
    }
    if (req.method === "POST") {
      const label = String(req.body?.label || "").slice(0, 60) || null
      const maxUses = Math.min(Math.max(parseInt(req.body?.maxUses) || 1, 1), 50)
      let code = makeCode()
      // avoid collision
      const { data: exists } = await db.from("invite_codes").select("code").eq("code", code).maybeSingle()
      if (exists) code = code + "X"
      const { error } = await db.from("invite_codes").insert({ code, label, max_uses: maxUses })
      if (error) throw error
      return res.status(200).json({ ok: true, code, url: `https://irlpass.xyz/?screen=redeem&code=${code}` })
    }
    return res.status(405).json({ error: "method not allowed" })
  } catch (e) {
    console.error("invite-code error:", e)
    return res.status(500).json({ error: "failed" })
  }
}
