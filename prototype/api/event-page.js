import { db } from "./_db.js"
import { page, esc, send } from "./_page.js"

// irlpass.xyz/e/<id>: the link people share from an event. anyone can open it,
// see who from irlpass is going, and land in that event's group chat after a
// 30 second signup. ?ref=021 credits whoever shared it.
const first = (n) => String(n || "").trim().split(/\s+/)[0] || ""

export default async function handler(req, res) {
  const id = Number(req.query?.id)
  const ref = /^\d{3}$/.test(String(req.query?.ref || "")) ? String(req.query.ref) : ""
  const { data: e } = id ? await db.from("events").select("*").eq("id", id).eq("hidden", false).maybeSingle() : { data: null }
  if (!e) return send(res, page("irlpass", `<p class="k">irlpass</p><h1>that event is gone</h1><a class="btn" href="/">see what's on</a>`))

  const { data: going } = await db.from("event_going").select("member_no").eq("event_id", id)
  const nos = (going || []).map((g) => g.member_no)
  const { data: people } = nos.length ? await db.from("members").select("name, photo_url, banned").in("member_no", nos) : { data: [] }
  const who = (people || []).filter((m) => !m.banned)
  const tz = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }[e.city] || "UTC"
  const when = new Date(e.starts_at).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toLowerCase()
  const title = e.titles?.en || e.title
  const count = who.length
  const line = count ? `${count} ${count === 1 ? "person" : "people"} from irlpass going` : "be the first from irlpass going"
  const join = `/?go=ev-${id}${ref ? `&ref=${ref}` : ""}`

  const faces = who.slice(0, 8).map((m) => `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;width:52px"><span style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:var(--deep);display:block">${m.photo_url ? `<img src="${esc(m.photo_url)}" style="width:100%;height:100%;object-fit:cover;filter:blur(6px);transform:scale(1.2)">` : ""}</span><span style="font-size:11px;font-weight:600">${esc(first(m.name).toLowerCase())}</span></span>`).join("")

  const body = `
${e.cover ? `<img src="${esc(e.cover)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:22px;display:block">` : ""}
<p class="k" style="margin-top:18px">${esc(when)}${e.venue ? ` · ${esc(e.venue)}` : ""}</p>
<h1>${esc(title)}</h1>
<div class="card">
  <p style="margin:0 0 10px;font-weight:600">${esc(line)}</p>
  ${faces ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${faces}</div>` : ""}
  <a class="btn" href="${esc(join)}">join the group chat</a>
  <p class="soft" style="font-size:13px;margin:10px 0 0;text-align:center">meet the people going before you get there. free, takes 30 seconds.</p>
</div>
${e.url ? `<p style="text-align:center;font-size:13px"><a href="${esc(e.url)}" target="_blank" rel="noreferrer">event details and tickets</a></p>` : ""}`

  let html = page(`${title} · who's going`, body)
  html = html.replace("</title>", `</title>
<meta property="og:title" content="${esc(`${title} · who's going`)}">
<meta property="og:description" content="${esc(`${when}${e.venue ? ` at ${e.venue}` : ""}. ${line}. join the group chat on irlpass.`)}">
${e.cover ? `<meta property="og:image" content="${esc(e.cover)}">` : ""}
<meta property="og:url" content="https://irlpass.xyz/e/${id}">
<meta name="twitter:card" content="summary_large_image">`)
  return send(res, html, "public, max-age=120")
}
