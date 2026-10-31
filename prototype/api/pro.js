import { randomBytes } from "node:crypto"
import { db } from "./_db.js"
import { stripe } from "./_stripe.js"
import { setting } from "./_access.js"
import { sendEmail } from "./_email.js"

// irlpass pro (irlpass.xyz/pro). one plan: $69/month, 14 days free. venues
// list their own stuff at their own prices and keep 100% of it; we charge the
// flat subscription. hosted experiences (our cut) come later via connect.
//
// GET                    -> { foundingLeft, members, photos }  (landing numbers)
// GET ?search=&city=     -> spots on our guide matching a name (claim your venue)
// GET ?session_id=       -> back from stripe: mark it paid, hand over the owner link
// GET ?owner=            -> the owner dashboard: profile, posts, this month's numbers
// POST { venue, perk, contact }            -> stripe checkout url
// POST { owner, action: profile|post|unpost|billing, ... } -> owner edits
const PRO = { cents: 6900, name: "irlpass pro" }
const TRIAL_DAYS = 14
const SITE = "https://irlpass.xyz"
const slugify = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
const clean = (s, n = 80) => String(s || "").trim().slice(0, n)
const day = (d) => d.toISOString().slice(0, 10)
const ownerUrl = (token) => `${SITE}/pro?owner=${token}`

// the first venues in a city get a founding partner badge (and nothing off the
// price: one price, no discount tiers)
async function foundingLeft(city) {
  const slots = Number(await setting("founding_partner_slots", "10")) || 0
  const { count } = await db.from("venues").select("slug", { count: "exact", head: true }).eq("city", city).eq("founding", true)
  return Math.max(0, slots - (count || 0))
}

async function byOwner(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ""))) return null
  const { data } = await db.from("venues").select("*").eq("owner_token", token).maybeSingle()
  return data && data.status !== "paused" ? data : null
}

// "23 irlpass members made plans at your spot this month": what renews at $69
async function numbers(v) {
  const now = new Date()
  const from = day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  const none = Promise.resolve({ data: [] })
  const [{ data: checkins }, { data: stories }, { data: events }, { data: going }] = await Promise.all([
    db.from("venue_checkins").select("group_size, spend_usd, day").eq("venue_slug", v.slug).gte("day", from),
    db.from("venue_stories").select("url, created_at").eq("venue_slug", v.slug).gte("created_at", from).order("created_at", { ascending: false }),
    db.from("venue_events").select("kind").eq("venue_slug", v.slug).gte("day", from),
    v.spot_id ? db.from("spot_going").select("night, member_no").eq("spot_id", v.spot_id).gte("night", from) : none,
  ])
  const c = checkins || []
  const people = c.reduce((n, x) => n + (x.group_size || 1), 0)
  const spent = c.filter((x) => x.spend_usd)
  // a plan is a night with members going; its size is how many said so
  const plans = {}
  for (const g of going || []) plans[g.night] = (plans[g.night] || 0) + 1
  return {
    since: from,
    going: (going || []).length,
    plans: Object.entries(plans).map(([night, size]) => ({ night, size })).sort((a, b) => b.night.localeCompare(a.night)),
    groups: c.length,
    people,
    avgGroup: c.length ? Math.round((people / c.length) * 10) / 10 : 0,
    spend: spent.reduce((n, x) => n + x.spend_usd, 0),
    spendReports: spent.length,
    stories: (stories || []).map((s) => s.url),
    views: (events || []).filter((e) => e.kind === "view").length,
    bookingTaps: (events || []).filter((e) => e.kind === "book").length,
  }
}

const today = () => day(new Date(Date.now() - 5 * 3600e3))
async function livePosts(slug) {
  const { data } = await db.from("venue_posts").select("id, title, body, day, ends_on").eq("venue_slug", slug).gte("ends_on", today()).order("created_at", { ascending: false })
  return data || []
}

const ownerView = (v) => ({
  slug: v.slug, name: v.name, city: v.city, area: v.area, status: v.status, founding: v.founding,
  perk: v.perk, story: v.story_perk, blurb: v.blurb, booking: v.booking_url, instagram: v.instagram,
  door: `${SITE}/v/${v.slug}`, listed: !!v.spot_id,
})

async function welcomeOwner(v) {
  if (!v.contact_email || !v.owner_token) return
  const first = String(v.contact_name || "").split(" ")[0].toLowerCase() || "there"
  await sendEmail({
    to: v.contact_email,
    subject: `${v.name} is on irlpass pro`,
    html: `
    <h1 style="font-size:26px;margin:0;letter-spacing:-0.5px">welcome, ${first}.</h1>
    <p style="font-size:15px;line-height:1.6;color:#655c53;margin:14px 0 0">
      your 14 free days started. this link is your venue's dashboard: post what's on, change your perk and booking link,
      and see who made plans at your place. keep it, it's how you get back in.
    </p>
    <a href="${ownerUrl(v.owner_token)}" style="display:block;background:#3a322c;color:#fdfaf6;text-decoration:none;font-weight:700;font-size:16px;text-align:center;border-radius:999px;padding:15px;margin-top:22px">open my dashboard</a>
    <p style="font-size:13px;color:#837a70;margin:16px 0 0">we look at every venue ourselves and message you on whatsapp within a day.</p>`,
  })
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
        const { data: cur } = await db.from("venues").select("*").eq("slug", slug).maybeSingle()
        if (!cur) return res.status(404).json({ error: "venue not found" })
        // paying never puts a venue live on its own: ops approves it (status active)
        const first = !cur.owner_token
        const patch = {
          status: cur.status === "active" ? "active" : "pending",
          plan: "pro",
          stripe_customer: s.customer,
          stripe_sub: s.subscription,
          owner_token: cur.owner_token || randomBytes(18).toString("base64url"),
          founding: cur.founding || (await foundingLeft(cur.city)) > 0,
        }
        await db.from("venues").update(patch).eq("slug", slug)
        const v = { ...cur, ...patch }
        if (first) await welcomeOwner(v)
        return res.status(200).json({ ok: true, venue: ownerView(v), owner: v.owner_token })
      }

      if (q.owner !== undefined) {
        const v = await byOwner(q.owner)
        if (!v) return res.status(404).json({ error: "this link doesn't open a venue. message us on whatsapp." })
        const [n, posts] = await Promise.all([numbers(v), livePosts(v.slug)])
        return res.status(200).json({ venue: ownerView(v), numbers: n, posts })
      }

      if (q.search !== undefined) {
        const needle = clean(q.search, 40).replace(/[%_,()]/g, " ").trim()
        if (needle.length < 2) return res.status(200).json({ spots: [] })
        const { data } = await db.from("spots").select("id, name, area, category, kind, photos").eq("city", city).eq("active", true).ilike("name", `%${needle}%`).limit(6)
        return res.status(200).json({
          spots: (data || []).map((s) => ({ spotId: s.id, name: s.name, area: s.area || "", kind: s.category || s.kind || "", photo: Array.isArray(s.photos) ? s.photos[0] || null : null })),
        })
      }

      // the landing's numbers are real: members in the city, founding badges left
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

    // owner mode: everything a venue changes about itself
    if (b.owner) {
      const v = await byOwner(b.owner)
      if (!v) return res.status(404).json({ error: "this link doesn't open a venue" })
      if (b.action === "profile") {
        const booking = clean(b.booking, 300)
        if (booking && !/^https?:\/\/\S+$/.test(booking)) return res.status(400).json({ error: "the booking link should start with https://" })
        const patch = {
          perk: clean(b.perk, 60) || v.perk,
          story_perk: clean(b.story, 60) || null,
          blurb: clean(b.blurb, 200) || null,
          booking_url: booking || null,
          instagram: clean(b.instagram, 60).replace(/^@/, "") || null,
        }
        const { error } = await db.from("venues").update(patch).eq("slug", v.slug)
        if (error) throw error
        return res.status(200).json({ ok: true, venue: ownerView({ ...v, ...patch }) })
      }
      if (b.action === "post") {
        const title = clean(b.title, 70)
        if (title.length < 3) return res.status(400).json({ error: "say what's on" })
        const when = /^\d{4}-\d{2}-\d{2}$/.test(String(b.day || "")) ? b.day : null
        const ends = when || day(new Date(Date.now() + (Math.min(30, Math.max(1, Number(b.days) || 7)) - 1) * 864e5 - 5 * 3600e3))
        const { count } = await db.from("venue_posts").select("id", { count: "exact", head: true }).eq("venue_slug", v.slug).gte("ends_on", today())
        if ((count || 0) >= 5) return res.status(400).json({ error: "you have 5 posts up. take one down first." })
        const { error } = await db.from("venue_posts").insert({ venue_slug: v.slug, title, body: clean(b.body, 200) || null, day: when, ends_on: ends })
        if (error) throw error
        return res.status(200).json({ ok: true, posts: await livePosts(v.slug) })
      }
      if (b.action === "unpost") {
        await db.from("venue_posts").delete().eq("venue_slug", v.slug).eq("id", Number(b.id) || 0)
        return res.status(200).json({ ok: true, posts: await livePosts(v.slug) })
      }
      if (b.action === "billing") {
        if (!v.stripe_customer) return res.status(400).json({ error: "no billing on this venue yet" })
        const s = await stripe("billing_portal/sessions", { customer: v.stripe_customer, return_url: ownerUrl(v.owner_token) })
        return res.status(200).json({ url: s.url })
      }
      return res.status(400).json({ error: "unknown action" })
    }

    // claim your venue -> stripe checkout
    const v = b.venue || {}, c = b.contact || {}, p = b.perk || {}
    const name = clean(v.name)
    const city = slugify(v.city || "medellin") || "medellin"
    const email = clean(c.email, 120)
    const phone = clean(c.phone, 40)
    if (!name) return res.status(400).json({ error: "pick your venue first" })
    if (!clean(c.name) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.replace(/\D/g, "").length < 7) {
      return res.status(400).json({ error: "add your name, email and whatsapp" })
    }
    const booking = clean(c.booking, 300)
    const slug = slugify(name) || `venue-${Date.now()}`
    const { data: existing } = await db.from("venues").select("slug, status, stripe_sub").eq("slug", slug).maybeSingle()
    if (existing?.stripe_sub) return res.status(409).json({ error: "this venue is already on irlpass pro. message us if that's wrong." })
    const { error } = await db.from("venues").upsert({
      slug, name, city, spot_id: Number(v.spotId) || null, area: clean(v.area, 60) || null,
      perk: clean(p.perk, 60) || "a free drink", story_perk: clean(p.story, 60) || null,
      contact_name: clean(c.name), contact_email: email, contact_phone: phone,
      instagram: clean(c.instagram, 60).replace(/^@/, "") || null,
      booking_url: /^https?:\/\/\S+$/.test(booking) ? booking : null,
      plan: "pro", status: existing?.status || "lead",
    })
    if (error) throw error

    const s = await stripe("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(PRO.cents),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": PRO.name,
      "line_items[0][quantity]": "1",
      "subscription_data[trial_period_days]": String(TRIAL_DAYS),
      customer_email: email,
      success_url: `${SITE}/pro?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/pro?step=you`,
      "metadata[venue]": slug,
      "metadata[plan]": "pro",
      "subscription_data[metadata][venue]": slug,
      "subscription_data[metadata][plan]": "pro",
    })
    return res.status(200).json({ url: s.url })
  } catch (e) {
    console.error("pro:", e.message)
    return res.status(500).json({ error: "something broke. message us and we'll sort it." })
  }
}
