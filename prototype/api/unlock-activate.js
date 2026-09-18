import { getUser } from "./_lib.js"
import { grantFromSession } from "./unlock.js"

// called by the stripe success redirect: checks the session really paid, then
// writes the unlock (or flips the pass on) for this member.
export default async function handler(req, res) {
  const { t, session_id } = req.query || {}
  const me = await getUser(t)
  if (!me) return res.status(401).json({ error: "not a member" })
  if (!session_id) return res.status(400).json({ error: "missing session" })

  try {
    const key = process.env.STRIPE_MODE === "test" ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(String(session_id))}`, {
      headers: { authorization: `Bearer ${key}` },
    })
    const session = await r.json()
    const paid =
      r.ok &&
      (session.payment_status === "paid" || session.status === "complete") &&
      session.metadata?.token === t
    if (!paid) return res.status(402).json({ error: "not paid" })

    const granted = await grantFromSession(me, session)
    return res.status(200).json({ ok: true, ...granted })
  } catch (e) {
    console.error("unlock-activate error:", e)
    return res.status(500).json({ error: "could not confirm the payment" })
  }
}
