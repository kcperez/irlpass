import { db } from "./_db.js"
import { stripe } from "./_stripe.js"
import { setting } from "./_access.js"

// irlpass for venues (the /pro landing + onboarding talk to this).
// members are free; venues pay for groups through the door + member stories.
//
// GET                    -> { foundingLeft, members, photos }  (landing numbers)
// GET ?search=&city=     -> spots on our guide matching a name (claim your venue)
// GET ?session_id=       -> back from stripe: switch the venue on, return it
// POST { venue, perk, contact, plan } -> stripe checkout url (14 days free)
const PLANS = {
  partner: { cents: 40000, name: "irlpass partner" },
  founding: { cents: 20000, name: "irlpass founding partner" },
}
const TRIAL_DAYS = 14
const slugify = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
const clean = (s, n = 80) => String(s || "").trim().slice(0, n)

async function foundingLeft(city) {
  const slots = Number(await setting("founding_partner_slots", "3")) || 0
  const { count } = await db.from("venues").select("slug", { count: "exact", head: true }).eq("city", city).eq("plan", "founding").in("status", ["active", "pending"])
  return Math.max(0, slots - (count || 0))
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = req.query || {}
      const city = slugify(q.city || "medellin") || "medellin"

      const sid = String(q.session_id || "")
      if (sid) {
        if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: "bad session" })
        const s = await stripe(`checkout/sessions/${sid}`)
        const slug = s.metadata?.venue
        if (s.status !== "complete" || !slug) return res.status(402).json({ error: "payment didn't go through" })
        // paying never puts a venue live on its own: ops approves it (status active)
        const { data: cur } = await db.from("venues").select("status").eq("slug", slug).maybeSingle()
        await db.from("venues").update({ status: cur?.status === "active" ? "active" : "pending", plan: s.metadata.plan, stripe_customer: s.customer, stripe_sub: s.subscription }).eq("slug", slug)
        const { data: v } = await db.from("venues").select("slug, name, perk, story_perk, plan, city").eq("slug", slug).maybeSingle()
        return res.status(200).json({ ok: true, venue: v })
      }

      if (q.search !== undefined) {
        const needle = clean(q.search, 40).replace(/[%_,()]/g, " ").trim()
        if (needle.length < 2) return res.status(200).json({ spots: [] })
        const { data } = await db.from("spots").select("id, name, area, category, kind, photos").eq("city", city).eq("active", true).ilike("name", `%${needle}%`).limit(6)
        return res.status(200).json({
          spots: (data || []).map((s) => ({ spotId: s.id, name: s.name, area: s.area || "", kind: s.category || s.kind || "", photo: Array.isArray(s.photos) ? s.photos[0] || null : null })),
        })
      }

      // the landing's numbers are real: members in the city, the founding spots left
      const [left, { count: members }, { data: spots }] = await Promise.all([
        foundingLeft(city),
        db.from("members").select("member_no", { count: "exact", head: true }).eq("city", city).eq("banned", false),
        db.from("spots").select("name, area, photos").eq("city", city).eq("active", true).not("photos", "is", null).order("sort").limit(12),
      ])
      const photos = (spots || []).filter((s) => Array.isArray(s.photos) && s.photos[0]).slice(0, 6).map((s) => ({ src: s.photos[0], name: s.name, area: s.area || "" }))
      res.setHeader("cache-control", "public, max-age=120")
      return res.status(200).json({ foundingLeft: left, members: members || 0, photos })
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const b = req.body || {}
    const v = b.venue || {}, c = b.contact || {}, p = b.perk || {}
    const name = clean(v.name)
    const city = slugify(v.city || "medellin") || "medellin"
    const email = clean(c.email, 120)
    const phone = clean(c.phone, 40)
    if (!name) return res.status(400).json({ error: "pick your venue first" })
    if (!clean(c.name) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.replace(/\D/g, "").length < 7) {
      return res.status(400).json({ error: "add your name, email and whatsapp" })
    }
    const perk = clean(p.perk, 60) || "a free drink"
    const storyPerk = clean(p.story, 60) || null
    const spotId = Number(v.spotId) || null
    const plan = b.plan === "founding" && (await foundingLeft(city)) > 0 ? "founding" : "partner"

    const slug = slugify(name) || `venue-${Date.now()}`
    const { data: existing } = await db.from("venues").select("slug, status").eq("slug", slug).maybeSingle()
    if (existing?.status === "active") return res.status(409).json({ error: "this venue is already a partner. message us if that's wrong." })
    const { error } = await db.from("venues").upsert({
      slug, name, city, spot_id: spotId, area: clean(v.area, 60) || null, perk, story_perk: storyPerk,
      contact_name: clean(c.name), contact_email: email, contact_phone: phone,
      instagram: clean(c.instagram, 60).replace(/^@/, "") || null, plan, status: existing?.status || "lead",
    })
    if (error) throw error

    const pl = PLANS[plan]
    const s = await stripe("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(pl.cents),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": pl.name,
      "line_items[0][quantity]": "1",
      "subscription_data[trial_period_days]": String(TRIAL_DAYS),
      customer_email: email,
      success_url: "https://irlpass.xyz/pro?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://irlpass.xyz/pro?step=plan",
      "metadata[venue]": slug,
      "metadata[plan]": plan,
      "subscription_data[metadata][venue]": slug,
      "subscription_data[metadata][plan]": plan,
    })
    return res.status(200).json({ url: s.url })
  } catch (e) {
    console.error("pro:", e.message)
    return res.status(500).json({ error: "something broke. message us and we'll sort it." })
  }
}
