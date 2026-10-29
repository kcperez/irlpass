import { db } from "./_db.js"
import { stripe } from "./_stripe.js"
import { setting } from "./_access.js"
import { page, send, esc } from "./_page.js"

// irlpass.xyz/pro: venues sign up and pay. members are free; venues pay for
// groups through the door + member stories. the first few are founding partners.
const PLANS = {
  partner: { cents: 40000, name: "irlpass partner" },
  founding: { cents: 20000, name: "irlpass founding partner" },
}
const slugify = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)

async function foundingLeft() {
  const slots = Number(await setting("founding_partner_slots", "3")) || 0
  const { count } = await db.from("venues").select("slug", { count: "exact", head: true }).eq("plan", "founding").eq("status", "active")
  return Math.max(0, slots - (count || 0))
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      // back from stripe: confirm the session and switch the venue on
      const sid = String(req.query?.session_id || "")
      if (/^cs_[A-Za-z0-9_]+$/.test(sid)) {
        const s = await stripe(`checkout/sessions/${sid}`)
        const slug = s.metadata?.venue
        if (s.status === "complete" && slug) {
          await db.from("venues").update({ status: "active", plan: s.metadata.plan, stripe_customer: s.customer, stripe_sub: s.subscription }).eq("slug", slug)
          return send(res, page("you're in · irlpass", `<p class="k">irlpass partner</p><h1>you're in.</h1>
<div class="card"><p>we'll message you on whatsapp within a day to set your perk, drop off your door qr and book your first irlpass night.</p></div>
<a class="btn" href="/">see irlpass</a>`))
        }
      }
      return send(res, landing(await foundingLeft()), "public, max-age=60")
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const b = req.body || {}
    const name = String(b.name || "").trim().slice(0, 80)
    const contactName = String(b.contactName || "").trim().slice(0, 80)
    const email = String(b.email || "").trim().slice(0, 120)
    const phone = String(b.phone || "").trim().slice(0, 40)
    const instagram = String(b.instagram || "").trim().replace(/^@/, "").slice(0, 60)
    const city = slugify(b.city || "medellin") || "medellin"
    if (!name || !contactName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.length < 7) {
      return res.status(400).json({ error: "add your venue, your name, email and whatsapp" })
    }
    const plan = b.plan === "founding" && (await foundingLeft()) > 0 ? "founding" : "partner"

    // one row per venue; a second signup for the same name reuses it
    let slug = slugify(name) || `venue-${Date.now()}`
    const { data: existing } = await db.from("venues").select("slug, status").eq("slug", slug).maybeSingle()
    if (existing?.status === "active") return res.status(409).json({ error: "this venue is already a partner. message us if that's wrong." })
    await db.from("venues").upsert({ slug, name, city, contact_name: contactName, contact_email: email, contact_phone: phone, instagram: instagram || null, plan, status: existing?.status || "lead" })

    const p = PLANS[plan]
    const s = await stripe("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(p.cents),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": p.name,
      "line_items[0][quantity]": "1",
      customer_email: email,
      success_url: "https://irlpass.xyz/pro?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://irlpass.xyz/pro",
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

function landing(left) {
  const body = `
<p class="k">irlpass for venues</p>
<h1>we bring the table. they post about it.</h1>
<p class="soft">irlpass is a members app for travelers and locals going out together. nobody on irlpass goes out alone: members show up as a table of 6 or a room of 25.</p>

<div class="card">
  <p class="k">what you get every month</p>
  <p><b>2 irlpass nights</b> at your place. we promote them to members in your city and bring the group.</p>
  <p><b>10 member stories</b> tagging you on instagram.</p>
  <p><b>top placement</b> in the app, a partner label, and your own posts in the feed.</p>
  <p><b>a monthly report</b>: visits, group sizes, estimated spend and every story link.</p>
  <p class="soft">if we miss the nights or the stories, next month is free.</p>
</div>

<div class="card">
  <p class="k">proof</p>
  <p>one irlpass night at mala audio in medellín: about 25 members, cover plus drinks, an estimated $900-1,600 spent in one night.</p>
</div>

<h2>become a partner</h2>
<div class="chips" id="plans">
  ${left > 0 ? `<button class="chip on" data-p="founding">founding · $200/mo</button>` : ""}
  <button class="chip${left > 0 ? "" : " on"}" data-p="partner">partner · $400/mo</button>
</div>
<p class="soft" id="planNote">${left > 0 ? `founding price for the first partners, ${left} left. monthly, cancel anytime.` : "monthly, cancel anytime."}</p>
<label>venue name</label><input id="name" autocomplete="organization">
<div class="row"><div><label>city</label><input id="city" value="medellín"></div><div><label>instagram</label><input id="instagram" placeholder="@yourspot"></div></div>
<label>your name</label><input id="contactName" autocomplete="name">
<div class="row"><div><label>email</label><input id="email" type="email" autocomplete="email"></div><div><label>whatsapp</label><input id="phone" type="tel" autocomplete="tel"></div></div>
<button id="go">continue to payment</button>
<p class="soft" id="err"></p>
<p class="soft" style="margin-top:22px">we pick every partner: a social crowd, good zero-proof options, a place our members would choose anyway. paying never buys a spot, and we never sell member data.</p>`
  const script = `
const $=(id)=>document.getElementById(id);let plan=${JSON.stringify(left > 0 ? "founding" : "partner")}
$("plans").onclick=(e)=>{const b=e.target.closest(".chip");if(!b)return;plan=b.dataset.p;[...$("plans").children].forEach(c=>c.classList.toggle("on",c===b))}
$("go").onclick=async()=>{$("go").disabled=true;$("err").textContent=""
const f=Object.fromEntries(["name","city","instagram","contactName","email","phone"].map(k=>[k,$(k).value]))
const r=await fetch("/api/pro",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...f,plan})}).then(r=>r.json()).catch(()=>({error:"no connection"}))
if(r.url){location.href=r.url;return}$("err").textContent=r.error;$("go").disabled=false}`
  return page("irlpass for venues", body, script)
}
