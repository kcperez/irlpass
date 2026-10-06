import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// GET -> the public key the browser subscribes with
// POST { t, sub } -> save this device's subscription
// DELETE { t, endpoint } -> turn it off on this device
export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || null })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  if (req.method === "POST") {
    const sub = req.body?.sub || {}
    const endpoint = String(sub.endpoint || "")
    if (!/^https:\/\//.test(endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return res.status(400).json({ error: "bad subscription" })
    await db.from("push_subs").upsert({ endpoint, member_no: me.memberNo, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, { onConflict: "endpoint" })
    return res.status(200).json({ ok: true })
  }
  if (req.method === "DELETE") {
    await db.from("push_subs").delete().eq("endpoint", String(req.body?.endpoint || "")).eq("member_no", me.memberNo)
    return res.status(200).json({ ok: true })
  }
  return res.status(405).json({ error: "method not allowed" })
}
