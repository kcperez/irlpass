import { db } from "./_db.js"
import { stripe } from "./_stripe.js"
import { sendEmail } from "./_email.js"

// stripe → irlpass. keeps members.paid / venues.status in step with the real
// subscription after checkout: renewals, failed cards, cancellations.
// we never trust the posted body: we take the event id and fetch the event
// back from stripe with our own key, so a forged post can't flip anything.
const OPS = "kevincastroperez@gmail.com"
const DEAD = new Set(["canceled", "unpaid", "incomplete_expired"])
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`

const subOf = (inv) =>
  inv.subscription || inv.parent?.subscription_details?.subscription || inv.lines?.data?.[0]?.subscription || null

async function owner(subId, customer) {
  const m = subId
    ? (await db.from("members").select("member_no, name, comped").eq("stripe_sub", subId).maybeSingle()).data
    : null
  const v = subId ? (await db.from("venues").select("slug, name, status").eq("stripe_sub", subId).maybeSingle()).data : null
  if (m || v || !customer) return { m, v }
  const m2 = (await db.from("members").select("member_no, name, comped").eq("stripe_customer", customer).maybeSingle()).data
  return { m: m2, v }
}

const label = ({ m, v }, fallback) => (m ? `nº ${m.member_no} ${m.name}` : v ? `venue ${v.name}` : fallback || "unknown customer")

async function tell(subject, line) {
  await sendEmail({ to: OPS, subject: `irlpass stripe: ${subject}`, html: `<p>${line}</p><p><a href="https://irlpass.xyz/api/revenue?key=">open revenue (add your admin key)</a></p>` })
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const id = String(req.body?.id || "")
  if (!/^evt_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: "bad event" })

  let ev
  try {
    ev = await stripe(`events/${id}`)
  } catch {
    return res.status(400).json({ error: "unknown event" })
  }
  const o = ev.data?.object || {}

  try {
    if (ev.type === "invoice.paid" && o.amount_paid > 0) {
      const who = await owner(subOf(o), o.customer)
      if (who.m) await db.from("members").update({ paid: true }).eq("member_no", who.m.member_no)
      if (who.v?.status === "paused") await db.from("venues").update({ status: "active" }).eq("slug", who.v.slug)
      await tell(`${money(o.amount_paid)} from ${label(who, o.customer_email)}`, `${label(who, o.customer_email)} paid ${money(o.amount_paid)} (${o.billing_reason || "invoice"}).`)
    }

    if (ev.type === "invoice.payment_failed") {
      const who = await owner(subOf(o), o.customer)
      const retry = o.next_payment_attempt ? new Date(o.next_payment_attempt * 1000).toDateString() : "no retry scheduled"
      await tell(`card failed for ${label(who, o.customer_email)}`, `${label(who, o.customer_email)}: ${money(o.amount_due)} failed. stripe retries: ${retry}.`)
    }

    if (ev.type === "customer.subscription.deleted" || (ev.type === "customer.subscription.updated" && DEAD.has(o.status))) {
      const who = await owner(o.id, o.customer)
      // comped founders keep their pass no matter what stripe says
      if (who.m && !who.m.comped) await db.from("members").update({ paid: false, stripe_sub: null }).eq("member_no", who.m.member_no)
      if (who.v) await db.from("venues").update({ status: "paused" }).eq("slug", who.v.slug)
      await tell(`${label(who)} canceled`, `${label(who)}'s subscription is ${o.status}. pass turned off, stripe won't charge them again.`)
    }

    if (ev.type === "customer.subscription.updated" && o.cancel_at_period_end && ev.data?.previous_attributes?.cancel_at_period_end === false) {
      const who = await owner(o.id, o.customer)
      const end = new Date((o.cancel_at || o.current_period_end || o.items?.data?.[0]?.current_period_end) * 1000).toDateString()
      await tell(`${label(who)} is canceling`, `${label(who)} turned off renewal. access runs until ${end}, then stripe stops charging.`)
    }
  } catch (e) {
    // 500 makes stripe retry the event later
    return res.status(500).json({ error: e.message })
  }
  return res.status(200).json({ received: true, type: ev.type })
}
