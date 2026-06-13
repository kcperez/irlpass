import { getAccepted } from "./_lib.js"
import { db } from "./_db.js"

// called by the stripe success redirect: verifies the checkout session really
// paid, then marks the member paid so the token unlocks the app
export default async function handler(req, res) {
  const { t, session_id } = req.query || {}
  if (!t || !session_id) return res.status(400).json({ error: "invalid" })
  try {
    const member = await getAccepted(t)
    if (!member) return res.status(404).json({ error: "not found" })

    if (!member.paid || !member.stripeCustomer) {
      const sandbox = process.env.STRIPE_MODE === "test"
      const key = sandbox ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`, {
        headers: { authorization: `Bearer ${key}` },
      })
      const session = await r.json()
      const paid =
        r.ok &&
        (session.payment_status === "paid" || session.status === "complete") &&
        session.metadata?.token === t
      if (!paid) return res.status(402).json({ error: "not paid" })

      const { error } = await db
        .from("members")
        .update({ paid: true, paid_at: new Date().toISOString(), stripe_customer: session.customer || null })
        .eq("token", t)
      if (error) throw error
    }
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("activate error:", e)
    return res.status(500).json({ error: "activation failed" })
  }
}
