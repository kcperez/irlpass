import { getMember } from "./_lib.js"
import { db } from "./_db.js"

// GET ?t=&id=&session_id= -> verify the seat was paid, add the buyer to the activity
export default async function handler(req, res) {
  const me = await getMember(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const id = String(req.query?.id || "")
  const sessionId = String(req.query?.session_id || "")
  if (!/^[a-f0-9]{16}$/.test(id) || !sessionId) return res.status(400).json({ error: "bad request" })

  try {
    const sandbox = process.env.STRIPE_MODE === "test"
    const key = sandbox ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY
    const sr = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { authorization: `Bearer ${key}` },
    })
    const session = await sr.json()
    const ok = sr.ok && session.payment_status === "paid" && session.metadata?.activityId === id && session.metadata?.buyerNo === me.memberNo
    if (!ok) return res.status(402).json({ error: "not paid" })

    const { data: act } = await db.from("activities").select("*").eq("id", id).maybeSingle()
    if (!act) return res.status(404).json({ error: "not found" })

    if (!act.joined.some((j) => j.memberNo === me.memberNo)) {
      const joined = [...act.joined, { name: me.name, ig: me.ig, memberNo: me.memberNo }]
      await db.from("activities").update({ joined }).eq("id", id)
      // record for host payout (idempotent on session id)
      const { data: existing } = await db.from("seat_payments").select("id").eq("stripe_session", sessionId).maybeSingle()
      if (!existing) {
        await db.from("seat_payments").insert({
          activity_id: id,
          activity_title: act.title,
          buyer_no: me.memberNo,
          buyer_name: me.name,
          host_no: act.creator.memberNo,
          amount_cents: act.price_cents,
          stripe_session: sessionId,
        })
      }
    }
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("seat-activate error:", e)
    return res.status(500).json({ error: "activation failed" })
  }
}
