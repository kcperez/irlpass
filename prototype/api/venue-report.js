import { db } from "./_db.js"
import { page, send, esc } from "./_page.js"

// ops: every partner venue's month (visits, group sizes, spend, story links),
// its printable door qr, and a form to add or edit a venue.
// irlpass.xyz/api/venue-report?key=ADMIN_KEY[&month=2026-11]
const SLUG = /^[a-z0-9-]{2,40}$/

export default async function handler(req, res) {
  const key = req.query?.key || req.body?.key
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "unauthorized" })

  if (req.method === "POST") {
    const b = req.body || {}
    const slug = String(b.slug || "").toLowerCase()
    if (!SLUG.test(slug) || !String(b.name || "").trim()) return res.status(400).json({ error: "slug and name required" })
    const row = { slug, name: String(b.name).trim().slice(0, 80) }
    if (b.spot_id !== undefined && b.spot_id !== "") row.spot_id = Number(b.spot_id) || null
    for (const k of ["city", "perk", "story_perk", "plan", "status", "instagram", "contact_name", "contact_phone"]) {
      if (b[k] !== undefined && b[k] !== "") row[k] = String(b[k]).trim().slice(0, 120)
    }
    const { error } = await db.from("venues").upsert(row)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  const month = /^\d{4}-\d{2}$/.test(req.query?.month || "") ? req.query.month : new Date().toISOString().slice(0, 7)
  const start = `${month}-01`
  const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)).toISOString().slice(0, 10)

  const [{ data: venues }, { data: checkins }, { data: stories }] = await Promise.all([
    db.from("venues").select("*").order("created_at"),
    db.from("venue_checkins").select("venue_slug, member_no, group_size, day, spend_usd").gte("day", start).lt("day", end),
    db.from("venue_stories").select("venue_slug, member_no, url, created_at").gte("created_at", start).lt("created_at", end),
  ])

  const rows = (venues || []).map((v) => {
    const c = (checkins || []).filter((x) => x.venue_slug === v.slug)
    const s = (stories || []).filter((x) => x.venue_slug === v.slug)
    const nights = new Set(c.map((x) => x.day)).size
    const avgGroup = c.length ? (c.reduce((a, x) => a + x.group_size, 0) / c.length).toFixed(1) : "-"
    const spends = c.filter((x) => x.spend_usd != null)
    const spend = spends.reduce((a, x) => a + x.spend_usd, 0)
    return { v, c, s, nights, avgGroup, spend, spendN: spends.length }
  })

  const doorUrl = (slug) => `https://irlpass.xyz/v/${slug}`
  const qr = (slug) => `https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=2&data=${encodeURIComponent(doorUrl(slug))}`
  const k = encodeURIComponent(key)

  const body = `
<p class="k">ops · venues · ${esc(month)}</p>
<h1>partner venues</h1>
<div class="scroll card"><table>
<tr><th>venue</th><th>plan</th><th>status</th><th>check-ins</th><th>days</th><th>avg group</th><th>reported spend</th><th>stories</th><th>door qr</th></tr>
${rows.map((r) => `<tr><td><b>${esc(r.v.name)}</b><br><span class="soft">${esc(r.v.city)} · ${esc(r.v.perk)}</span></td><td>${esc(r.v.plan)}</td><td>${r.v.status === "pending" ? "<b>pending · approve</b>" : esc(r.v.status)}<br><span class="soft">${r.v.contact_name ? esc(r.v.contact_name) + " · " + esc(r.v.contact_phone || "") : ""}</span></td><td>${r.c.length}</td><td>${r.nights}</td><td>${r.avgGroup}</td><td>${r.spendN ? `$${r.spend} <span class="soft">(${r.spendN})</span>` : "-"}</td><td>${r.s.length}</td><td><a href="${qr(r.v.slug)}" target="_blank">print</a> · <a href="${doorUrl(r.v.slug)}" target="_blank">open</a></td></tr>`).join("") || `<tr><td colspan="9" class="soft">no venues yet</td></tr>`}
</table></div>
${rows.filter((r) => r.s.length).map((r) => `<h2>${esc(r.v.name)} · stories</h2><div class="card">${r.s.map((x) => `<p><a href="${esc(x.url)}" target="_blank">${esc(x.url)}</a> <span class="soft">member ${esc(x.member_no)} · ${esc(x.created_at.slice(0, 10))}</span></p>`).join("")}</div>`).join("")}
<h2>add or edit a venue</h2>
<div class="card">
<div class="row"><div><label>slug (url)</label><input id="slug" placeholder="mala-audio"></div><div><label>name</label><input id="name" placeholder="Mala Audio"></div></div>
<div class="row"><div><label>city</label><input id="city" value="medellin"></div><div><label>instagram</label><input id="instagram"></div></div>
<div class="row"><div><label>perk at the door</label><input id="perk" placeholder="a free drink"></div><div><label>extra perk for a story</label><input id="story_perk" placeholder="a second drink"></div></div>
<div class="row"><div><label>guide spot id (shows the perk in the app)</label><input id="spot_id" inputmode="numeric"></div></div>
<div class="row"><div><label>plan</label><select id="plan"><option>pro</option><option>listing</option></select></div><div><label>status</label><select id="status"><option>active</option><option>pending</option><option>lead</option><option>paused</option></select></div></div>
<button id="save">save venue</button><p class="soft" id="msg"></p>
</div>
<p class="soft">other months: <a href="?key=${k}&month=${esc(prevMonth(month))}">${esc(prevMonth(month))}</a></p>`
  const script = `
const $=(id)=>document.getElementById(id)
$("save").onclick=async()=>{const f=Object.fromEntries(["slug","name","city","instagram","perk","story_perk","plan","status","spot_id"].map(k=>[k,$(k).value]))
const r=await fetch("/api/venue-report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...f,key:${JSON.stringify(key)}})}).then(r=>r.json())
$("msg").textContent=r.ok?"saved":r.error;if(r.ok)setTimeout(()=>location.reload(),600)}`
  return send(res, page("ops · venues", body, script))
}

function prevMonth(m) {
  const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1))
  return d.toISOString().slice(0, 7)
}
