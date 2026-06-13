import { getMember } from "./_lib.js"

// POST { t } -> stripe customer portal session url (manage / cancel subscription)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getMember(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  if (!me.stripeCustomer) return res.status(404).json({ error: "no billing on file" })

  try {
    const sandbox = process.env.STRIPE_MODE === "test"
    const key = sandbox ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY
    const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        customer: me.stripeCustomer,
        return_url: `https://irlpass.xyz/?screen=app&t=${me.token}`,
      }),
    })
    const session = await r.json()
    if (!session.url) {
      console.error("portal error:", session.error?.message)
      return res.status(502).json({ error: "portal unavailable" })
    }
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error("portal error:", e)
    return res.status(500).json({ error: "portal failed" })
  }
}
