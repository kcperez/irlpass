import { db } from "./_db.js"
import { page, esc, send } from "./_page.js"
import { aboutFor } from "./event-about.js"

// irlpass.xyz/e/<id>: the link people share from an event. anyone can open it,
// see who from irlpass is going, and land in that event's group chat after a
// 30 second signup. ?ref=021 credits whoever shared it.
const first = (n) => String(n || "").trim().split(/\s+/)[0] || ""

export const config = { maxDuration: 20 }

export default async function handler(req, res) {
  const id = Number(req.query?.id)
  const ref = /^\d{3}$/.test(String(req.query?.ref || "")) ? String(req.query.ref) : ""
  const { data: e } = id ? await db.from("events").select("*").eq("id", id).eq("hidden", false).maybeSingle() : { data: null }
  if (!e) return send(res, page("irlpass", `<p class="k">irlpass</p><h1>that event is gone</h1><a class="btn" href="/">see what's on</a>`))

  const { data: going } = await db.from("event_going").select("member_no").eq("event_id", id)
  const nos = (going || []).map((g) => g.member_no)
  const { data: people } = nos.length ? await db.from("members").select("member_no, name, photo_url, banned").in("member_no", nos) : { data: [] }
  const who = (people || []).filter((m) => !m.banned)
  const tz = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }[e.city] || "UTC"
  const when = new Date(e.starts_at).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toLowerCase()
  const title = e.titles?.en || e.title
  const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz })
  const diff = Math.round((Date.parse(dayKey(e.starts_at)) - Date.parse(dayKey(Date.now()))) / 864e5)
  const hour = Number(new Date(e.starts_at).toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }))
  const day = diff <= 0 ? (hour >= 17 || hour < 4 ? "tonight" : "today")
    : diff === 1 ? (hour >= 17 ? "tomorrow night" : "tomorrow")
    : diff < 7 ? `this ${new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: tz, weekday: "long" }).toLowerCase()}`
    : `on ${new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" }).toLowerCase()}`
  const count = who.length
  const line = count ? `${count} ${count === 1 ? "person" : "people"} from irlpass going` : "be the first from irlpass going"
  // a personal invite: the person who shared it shows clearly, by name
  const { data: inviter } = ref ? await db.from("members").select("member_no, name, photo_url, banned").eq("member_no", ref).maybeSingle() : { data: null }
  const host = inviter && !inviter.banned ? inviter : null
  const hostGoing = host && nos.includes(host.member_no)
  const invite = host ? `<div style="display:flex;align-items:center;gap:12px;margin:0 0 16px">
  ${host.photo_url ? `<img src="${esc(host.photo_url)}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px #4a66ff">` : ""}
  <div><p style="margin:0;font-weight:700;font-size:17px">${esc(first(host.name).toLowerCase())} invited you</p><p class="soft" style="margin:2px 0 0;font-size:13px">${hostGoing ? "they're going" : "they think you'd like this"}</p></div>
</div>` : ""
  // what it actually is: the same two lines members see, written once (max ~8s on first open)
  const about = await Promise.race([aboutFor(e), new Promise((r) => setTimeout(() => r(null), 8000))]).catch(() => null)
  const price = e.is_free ? "free" : e.price_cents ? `${(e.price_cents / 100).toFixed(0)} ${String(e.currency || "usd").toUpperCase()}` : ""
  const maps = e.address || e.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue, e.address].filter(Boolean).join(", "))}` : ""
  const join = `/?go=ev-${id}${ref ? `&ref=${ref}` : ""}`

  const faces = who.filter((m) => !host || m.member_no !== host.member_no).slice(0, 8).map((m) => `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;width:52px"><span style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.08);display:block">${m.photo_url ? `<img src="${esc(m.photo_url)}" style="width:100%;height:100%;object-fit:cover;filter:blur(6px);transform:scale(1.2)">` : ""}</span><span style="font-size:11px;font-weight:600">${esc(first(m.name).toLowerCase())}</span></span>`).join("")

  const body = `
${e.cover ? `<img src="${esc(e.cover)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:22px;display:block">` : ""}
<p class="k" style="margin-top:18px">${esc(when)}${e.venue ? ` · ${esc(e.venue)}` : ""}</p>
<h1>${esc(title)}</h1>
${about?.en ? `<p class="soft" style="font-size:16px;line-height:1.5;margin:-4px 0 14px">${esc(about.en)}</p>` : ""}
<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px">
  ${e.venue || e.address ? `<a href="${esc(maps)}" target="_blank" rel="noreferrer" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);text-decoration:none;font-size:13.5px;font-weight:600">📍 ${esc(e.venue || e.address)}</a>` : ""}
  ${price ? `<span style="display:inline-flex;align-items:center;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);font-size:13.5px;font-weight:600">🎟 ${esc(price)}</span>` : ""}
</div>
<div class="card">
  ${invite}
  <p style="margin:0 0 10px;font-weight:600">${esc(line)}</p>
  ${faces ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${faces}</div>` : ""}
  <a class="btn" href="${esc(join)}">join the group chat</a>
  <p class="soft" style="font-size:13px;margin:10px 0 0;text-align:center">meet the people going before you get there. free, takes 30 seconds.</p>
</div>
${e.url ? `<p style="text-align:center;font-size:13px"><a href="${esc(e.url)}" target="_blank" rel="noreferrer">event details and tickets</a></p>` : ""}`

  let html = page(`${title} · who's going`, body)
  html = html.replace("</title>", `</title>
<meta property="og:title" content="${esc(host ? `${first(host.name).toLowerCase()} invited you: ${title}` : title)}">
<meta property="og:description" content="${esc(`${day}${e.venue ? ` at ${e.venue}` : ""} · ${count ? `${count} going on irlpass` : "see who's going on irlpass"}`)}">
<meta property="og:image" content="${esc(e.cover ? String(e.cover).replace(/([?&])w=\d+/, "$1w=1200") : `https://irlpass.xyz/api/og?id=${id}`)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="https://irlpass.xyz/e/${id}">
<meta name="twitter:card" content="summary_large_image">`)
  return send(res, html, "public, max-age=120")
}
