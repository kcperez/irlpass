import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { today, hasComp } from "./_access.js"
import { actsAsMod } from "./_mods.js"
import { stripe } from "./_stripe.js"

// the guaranteed ride, members only, bought right in the app.
// GET  ?t=&city=                       -> upcoming rides with seats left + mine
// POST { t, rideId }                   -> stripe checkout for one seat
// POST { t, action: "confirm", session_id } -> back from stripe: mark the seat paid
const isMember = (me) => !!me.paid || hasComp(me) || actsAsMod(me)

async function seatsTaken(rideIds) {
  if (!rideIds.length) return new Map()
  const { data } = await db.from("ride_orders").select("ride_id, member_no").in("ride_id", rideIds).eq("status", "paid")
  const out = new Map()
  for (const o of data || []) out.set(o.ride_id, [...(out.get(o.ride_id) || []), o.member_no])
  return out
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const city = String(req.query?.city || "medellin")
      const { data: rides } = await db.from("rides").select("*").eq("city", city).eq("active", true).gte("night", today()).order("night")
      const taken = await seatsTaken((rides || []).map((r) => r.id))
      return res.status(200).json({
        member: isMember(me),
        rides: (rides || []).map((r) => {
          const who = taken.get(r.id) || []
          return {
            id: r.id,
            title: r.title,
            night: r.night,
            depart: r.depart || "",
            price: r.price_cents,
            seats: r.seats,
            left: Math.max(0, r.seats - who.length),
            mine: who.includes(me.memberNo),
          }
        }),
      })
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })

    if (req.body?.action === "confirm") {
      const sid = String(req.body?.session_id || "")
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: "bad session" })
      const session = await stripe(`checkout/sessions/${sid}`)
      if (session.payment_status !== "paid" || session.metadata?.memberNo !== me.memberNo || !session.metadata?.rideId) {
        return res.status(402).json({ error: "not paid" })
      }
      await db.from("ride_orders").upsert(
        { ride_id: Number(session.metadata.rideId), member_no: me.memberNo, stripe_session: sid, status: "paid" },
        { onConflict: "stripe_session" }
      )
      return res.status(200).json({ ok: true, rideId: Number(session.metadata.rideId) })
    }

    // members only: the subscription (free first month) is the gate
    if (!isMember(me)) return res.status(402).json({ error: "the ride is for members", gate: "member" })
    const rideId = Number(req.body?.rideId)
    const { data: ride } = await db.from("rides").select("*").eq("id", rideId).eq("active", true).maybeSingle()
    if (!ride || ride.night < today()) return res.status(404).json({ error: "that ride isn't running" })
    const taken = (await seatsTaken([ride.id])).get(ride.id) || []
    if (taken.includes(me.memberNo)) return res.status(409).json({ error: "you already have a seat" })
    if (taken.length >= ride.seats) return res.status(410).json({ error: "sold out" })

    const token = req.body.t
    const session = await stripe("checkout/sessions", {
      mode: "payment",
      customer_email: me.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(ride.price_cents),
      "line_items[0][price_data][product_data][name]": `irlpass · ${ride.title}`,
      "line_items[0][price_data][product_data][description]": [ride.night, ride.depart].filter(Boolean).join(" · "),
      success_url: `https://irlpass.xyz/?screen=app&t=${token}&ride=${ride.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://irlpass.xyz/?screen=app&t=${token}`,
      "metadata[memberNo]": me.memberNo,
      "metadata[rideId]": String(ride.id),
      "metadata[kind]": "ride",
    })
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error("rides error:", e)
    return res.status(500).json({ error: "the ride checkout isn't available right now" })
  }
}
