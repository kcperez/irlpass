import { getAccepted } from "./_lib.js"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const { token } = req.body || {}
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    return res.status(400).json({ error: "invalid token" })
  }

  try {
    const member = await getAccepted(token)
    if (!member || member.banned) return res.status(404).json({ error: "not found" })

    // STRIPE_MODE=test routes checkout through the sandbox; anything else is live.
    const sandbox = process.env.STRIPE_MODE === "test"
    const stripeKey = sandbox ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY
    const yearly = req.body?.plan === "yearly"
    const priceId = sandbox
      ? (yearly ? process.env.STRIPE_TEST_SUB_PRICE_YR : process.env.STRIPE_TEST_SUB_PRICE)
      : (yearly ? process.env.STRIPE_SUB_PRICE_YR : process.env.STRIPE_SUB_PRICE)

    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      customer_email: member.email,
      success_url: `https://irlpass.xyz/?screen=pass&t=${token}&session_id={CHECKOUT_SESSION_ID}&name=${encodeURIComponent(member.name)}&n=${member.memberNo}&ig=${encodeURIComponent(member.ig)}`,
      cancel_url: `https://irlpass.xyz/?screen=offer&t=${token}`,
      "metadata[token]": token,
      "subscription_data[metadata][token]": token,
      "metadata[ig]": member.ig,
      "metadata[memberNo]": member.memberNo,
    })

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${stripeKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })
    const session = await r.json()
    if (!r.ok || !session.url) {
      console.error("stripe error:", session.error?.message)
      return res.status(502).json({ error: "checkout unavailable" })
    }
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error("checkout error:", e)
    return res.status(500).json({ error: "checkout failed" })
  }
}
