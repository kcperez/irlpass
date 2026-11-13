import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isMod } from "./_mods.js"
import { PACKS, FREE, perksLeft, slots } from "./_perks.js"

// the host side of story perks (the guest side is public: api/perk-page.js)
// GET  ?t&id                        -> { perk, left, link, mine?, host?: { claims, slots, packs } }
// GET  ?t&session_id                -> back from buying slots: add them
// POST { t, action: "buy", slots, id } -> stripe checkout url for a slot pack
const stripeKey = () => (process.env.STRIPE_MODE === "test" ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  try {
    if (req.method === "GET" && req.query?.session_id) {
      const sid = String(req.query.session_id)
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, { headers: { authorization: `Bearer ${stripeKey()}` } })
      const s = await r.json()
      if (!r.ok || s.payment_status !== "paid" || s.metadata?.kind !== "slots" || s.metadata?.hostNo !== me.memberNo) return res.status(402).json({ error: "that payment didn't go through" })
      const n = Number(s.metadata.slots) || 0
      const { error: dup } = await db.from("perk_purchases").insert({ session_id: sid, host_no: me.memberNo, slots: n, cents: s.amount_total || 0 })
      if (!dup) {
        for (let i = 0; i < 5; i++) {
          const { data: m } = await db.from("members").select("perk_credits").eq("member_no", me.memberNo).maybeSingle()
          const have = m?.perk_credits || 0
          const { data: done } = await db.from("members").update({ perk_credits: have + n }).eq("member_no", me.memberNo).eq("perk_credits", have).select("member_no")
          if (done?.length) break
        }
      }
      return res.status(200).json({ ok: true, added: n, slots: await slots(me.memberNo), id: Number(s.metadata.eventId) || null })
    }

    if (req.method === "GET") {
      const id = Number(req.query?.id)
      const { data: e } = await db.from("events").select("id, perk, host_no, title").eq("id", id).maybeSingle()
      if (!e?.perk) return res.status(404).json({ error: "no perk on this one" })
      const out = { perk: e.perk, left: await perksLeft(e), link: `https://irlpass.xyz/p/${id}` }
      if (me.ig) {
        const { data: mine } = await db.from("perk_claims").select("code, status").eq("event_id", id).eq("handle", String(me.ig).toLowerCase().replace(/^@+/, "")).maybeSingle()
        out.mine = mine || null
      }
      if (e.host_no === me.memberNo || isMod(me.memberNo)) {
        const { data: rows } = await db.from("perk_claims").select("id, handle, status, created_at, given_at").eq("event_id", id).order("created_at", { ascending: false }).limit(300)
        out.host = { claims: rows || [], slots: await slots(e.host_no), free: FREE, packs: Object.entries(PACKS).map(([n, c]) => ({ slots: Number(n), cents: c })) }
      }
      return res.status(200).json(out)
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    if (req.body?.action === "buy") {
      const n = Number(req.body?.slots)
      if (!PACKS[n]) return res.status(400).json({ error: "pick a pack" })
      const id = Number(req.body?.id) || ""
      const back = `https://irlpass.xyz/?screen=app&t=${me.token}`
      const params = new URLSearchParams({
        mode: "payment",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(PACKS[n]),
        "line_items[0][price_data][product_data][name]": `${n} story slots`,
        "line_items[0][quantity]": "1",
        success_url: `${back}&slots=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${back}${id ? `&go=ev-${id}` : ""}`,
        "metadata[kind]": "slots",
        "metadata[slots]": String(n),
        "metadata[hostNo]": me.memberNo,
        "metadata[eventId]": String(id),
      })
      const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${stripeKey()}`, "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      })
      const s = await r.json()
      if (!s.url) return res.status(502).json({ error: "checkout is down for a sec. try again." })
      return res.status(200).json({ url: s.url })
    }
    return res.status(400).json({ error: "unknown action" })
  } catch (err) {
    console.error("perks error:", err)
    return res.status(500).json({ error: "something broke. try again." })
  }
}
