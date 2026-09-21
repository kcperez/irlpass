import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isValidCity, cityLabel, canonicalCity } from "./_cities.js"
import { isDate, today } from "./_access.js"

// v2 pricing. Prices are built inline (price_data) so a new city or window
// needs no Stripe dashboard work.
export const TRIP_PRICE = Number(process.env.TRIP_PRICE_CENTS || 1900) // $19, one window
export const PASS_PRICE = Number(process.env.PASS_PRICE_CENTS || 2900) // $29/mo, every window

const stripeKey = () =>
  process.env.STRIPE_MODE === "test" ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY

// POST { t, city, starts, ends, plan: 'trip' | 'pass' } -> stripe checkout url
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const { starts, ends } = req.body || {}
  const city = canonicalCity(req.body?.city)
  const plan = req.body?.plan === "pass" ? "pass" : "trip"
  if (!isValidCity(city)) return res.status(400).json({ error: "unknown city" })
  if (!isDate(starts) || !isDate(ends) || ends < starts) return res.status(400).json({ error: "bad dates" })
  if (ends < today()) return res.status(400).json({ error: "those dates have passed" })

  const cityName = cityLabel(city)
  const token = req.body.t
  const base = "https://irlpass.xyz"

  const params = new URLSearchParams({
    mode: plan === "pass" ? "subscription" : "payment",
    customer_email: me.email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(plan === "pass" ? PASS_PRICE : TRIP_PRICE),
    "line_items[0][price_data][product_data][name]":
      plan === "pass" ? "irlpass · every city, every trip" : `irlpass · ${cityName} ${starts} to ${ends}`,
    success_url: `${base}/?screen=app&t=${token}&unlock=1&city=${city}&starts=${starts}&ends=${ends}&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?screen=app&t=${token}`,
    "metadata[token]": token,
    "metadata[memberNo]": me.memberNo,
    "metadata[city]": city,
    "metadata[starts]": starts,
    "metadata[ends]": ends,
    "metadata[plan]": plan,
  })
  if (plan === "pass") {
    params.set("line_items[0][price_data][recurring][interval]", "month")
    params.set("subscription_data[metadata][token]", token)
  }

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${stripeKey()}`, "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    const session = await r.json()
    if (!r.ok || !session.url) {
      console.error("unlock stripe error:", session.error?.message)
      return res.status(502).json({ error: "checkout unavailable" })
    }
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error("unlock error:", e)
    return res.status(500).json({ error: "checkout failed" })
  }
}

// shared with unlock-activate: write the purchased window (or flip the pass on)
export async function grantFromSession(me, session) {
  const { city, starts, ends, plan } = session.metadata || {}
  if (plan === "pass") {
    await db
      .from("members")
      .update({ paid: true, paid_at: new Date().toISOString(), stripe_customer: session.customer || null })
      .eq("member_no", me.memberNo)
    return { plan: "pass" }
  }
  const { data: existing } = await db
    .from("unlocks")
    .select("id")
    .eq("stripe_session", session.id)
    .maybeSingle()
  if (!existing) {
    await db.from("unlocks").insert({
      member_no: me.memberNo,
      city,
      starts,
      ends,
      source: "stripe",
      stripe_session: session.id,
    })
  }
  return { plan: "trip", city, starts, ends }
}
