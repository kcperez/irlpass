import { getMember } from "./_lib.js"
import { db } from "./_db.js"

// POST { t, id } -> stripe one-time checkout for a paid activity seat
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getMember(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const id = String(req.body?.id || "")
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: "bad id" })

  try {
    const { data: act } = await db.from("activities").select("*").eq("id", id).maybeSingle()
    if (!act) return res.status(404).json({ error: "not found" })
    if (!act.price_cents) return res.status(400).json({ error: "this activity is free" })
    if (act.joined.some((j) => j.memberNo === me.memberNo)) return res.status(409).json({ error: "already in" })
    if (act.spots < 999 && act.joined.length >= act.spots) return res.status(409).json({ error: "full" })

    const sandbox = process.env.STRIPE_MODE === "test"
    const key = sandbox ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY
    const params = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(act.price_cents),
      "line_items[0][price_data][product_data][name]": `${act.title} — seat`,
      "line_items[0][quantity]": "1",
      success_url: `https://irlpass.xyz/?screen=app&t=${me.token}&seat=${id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://irlpass.xyz/?screen=app&t=${me.token}`,
      "metadata[activityId]": id,
      "metadata[buyerNo]": me.memberNo,
      "metadata[token]": me.token,
    })
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    const session = await r.json()
    if (!session.url) return res.status(502).json({ error: "checkout unavailable" })
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error("seat-checkout error:", e)
    return res.status(500).json({ error: "checkout failed" })
  }
}
