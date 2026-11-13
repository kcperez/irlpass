import crypto from "crypto"
import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isMod } from "./_mods.js"
import { kindOf } from "./_events.js"

export const config = { api: { bodyParser: { sizeLimit: "3mb" } } }

// hosts make their own events, and paid ones sell tickets.
// POST { t, action: "create", title, startsAt, endsAt?, venue, address?, details?, category?, capacity?, price?, city, image? }
// POST { t, action: "hide", id }                    -> host (or a mod) takes it down
// POST { t, action: "ticket", id }                  -> stripe checkout url
// GET  ?t&id&session_id                             -> after checkout: verify, mark going, open the chat
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "someone"
const stripeKey = () => (process.env.STRIPE_MODE === "test" ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY)
const CATS = ["run", "wellness", "party", "food", "art", "social", "tech"]

async function joinChat(id, me, extra = {}) {
  const { data: had } = await db.from("event_going").select("event_id").eq("event_id", id).eq("member_no", me.memberNo).maybeSingle()
  if (had) return
  await db.from("event_going").insert({ event_id: id, member_no: me.memberNo, ...extra })
  await db.from("messages").insert({ channel: `ev-${id}`, body: `${first(me.name)} is going 🙌`, from_name: "irlpass", from_ig: "@irlpass.xyz", from_member_no: "000" })
}

async function uploadCover(image, key) {
  const m = String(image || "").match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
  if (!m) return null
  const buf = Buffer.from(m[2], "base64")
  if (buf.length > 1_800_000) return null
  const path = `avatars/event-${key}.jpg`
  const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, "content-type": `image/${m[1]}`, "x-upsert": "true" },
    body: buf,
  })
  return up.ok ? `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}?v=${Date.now()}` : null
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const id = Number(req.query?.id)
      const sid = String(req.query?.session_id || "")
      if (!id || !sid) return res.status(400).json({ error: "bad request" })
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, { headers: { authorization: `Bearer ${stripeKey()}` } })
      const s = await r.json()
      if (!r.ok || s.payment_status !== "paid" || s.metadata?.eventId !== String(id) || s.metadata?.buyerNo !== me.memberNo) {
        return res.status(402).json({ error: "that ticket isn't paid yet" })
      }
      await joinChat(id, me, { paid_cents: s.amount_total ?? null, stripe_session: sid, via: /^\d{3}$/.test(s.metadata?.via || "") ? s.metadata.via : null })
      return res.status(200).json({ ok: true, channel: `ev-${id}` })
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const action = req.body?.action

    if (action === "create") {
      if (!me.canHost && !isMod(me.memberNo)) return res.status(403).json({ error: "hosting is invite only for now" })
      const title = String(req.body?.title || "").trim().slice(0, 120)
      const starts = Date.parse(req.body?.startsAt)
      const ends = Date.parse(req.body?.endsAt || "")
      const venue = String(req.body?.venue || "").trim().slice(0, 120)
      if (title.length < 3) return res.status(400).json({ error: "give it a name" })
      if (!starts || starts < Date.now() - 3600e3) return res.status(400).json({ error: "pick a time that hasn't passed" })
      if (!venue) return res.status(400).json({ error: "where is it?" })
      const price = Math.round(Number(req.body?.price || 0) * 100)
      if (price && (price < 100 || price > 100000)) return res.status(400).json({ error: "tickets are $1 to $1,000" })
      const capacity = Number(req.body?.capacity) > 0 ? Math.min(5000, Math.round(Number(req.body.capacity))) : null
      const key = crypto.randomBytes(8).toString("hex")
      const row = {
        source: "irlpass",
        source_id: key,
        city: String(req.body?.city || me.city || "medellin").slice(0, 40),
        title,
        starts_at: new Date(starts).toISOString(),
        ends_at: ends && ends > starts ? new Date(ends).toISOString() : null,
        venue,
        address: String(req.body?.address || "").trim().slice(0, 200) || null,
        details: String(req.body?.details || "").trim().slice(0, 1500) || null,
        category: CATS.includes(req.body?.category) ? req.body.category : kindOf(title, req.body?.details || ""),
        price_cents: price || null,
        currency: price ? "usd" : null,
        is_free: !price,
        capacity,
        host: me.name,
        host_no: me.memberNo,
        featured: true,
        cover: await uploadCover(req.body?.image, key),
      }
      const { data, error } = await db.from("events").insert(row).select("id").single()
      if (error) throw error
      // the host is in their own chat from the start
      await joinChat(data.id, me)
      return res.status(200).json({ ok: true, id: data.id })
    }

    const id = Number(req.body?.id)
    const { data: e } = id ? await db.from("events").select("*").eq("id", id).eq("hidden", false).maybeSingle() : { data: null }
    if (!e) return res.status(404).json({ error: "that event is gone" })

    if (action === "hide") {
      if (e.host_no !== me.memberNo && !isMod(me.memberNo)) return res.status(403).json({ error: "only the host" })
      await db.from("events").update({ hidden: true }).eq("id", id)
      return res.status(200).json({ ok: true })
    }

    if (action === "ticket") {
      if (!e.price_cents) return res.status(400).json({ error: "this one is free" })
      const { count } = await db.from("event_going").select("event_id", { count: "exact", head: true }).eq("event_id", id)
      if (e.capacity && count >= e.capacity) return res.status(409).json({ error: "sold out" })
      const via = /^\d{3}$/.test(String(req.body?.via || "")) ? req.body.via : ""
      const back = `https://irlpass.xyz/?screen=app&t=${me.token}`
      const params = new URLSearchParams({
        mode: "payment",
        "line_items[0][price_data][currency]": e.currency || "usd",
        "line_items[0][price_data][unit_amount]": String(e.price_cents),
        "line_items[0][price_data][product_data][name]": `${e.title}: ticket`,
        "line_items[0][quantity]": "1",
        success_url: `${back}&ticket=${id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${back}&go=ev-${id}`,
        "metadata[eventId]": String(id),
        "metadata[buyerNo]": me.memberNo,
        "metadata[hostNo]": e.host_no || "",
        "metadata[via]": via,
      })
      const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${stripeKey()}`, "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      })
      const s = await r.json()
      if (!s.url) return res.status(502).json({ error: "tickets are down for a sec. try again." })
      return res.status(200).json({ url: s.url })
    }
    return res.status(400).json({ error: "unknown action" })
  } catch (err) {
    console.error("event-host error:", err)
    return res.status(500).json({ error: "something broke. try again." })
  }
}
