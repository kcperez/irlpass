import { db } from "./_db.js"

// a shared "my day" link unfurls with the plan itself (title + the stops) in
// imessage / whatsapp, then boots the app like any other page
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

export default async function handler(req, res) {
  const id = String(req.query?.id || "").slice(0, 20)
  const [page, { data }] = await Promise.all([
    fetch("https://irlpass.xyz/index.html").then((r) => r.text()),
    db.from("day_plans").select("city_name, stops").eq("id", id).maybeSingle(),
  ])
  let html = page
  if (data?.stops?.stops) {
    const title = `${data.stops.title} · a day in ${String(data.city_name || "").toLowerCase()}`
    const desc = data.stops.stops.slice(0, 6).map((s) => `${s.time} ${s.emoji} ${s.name}`).join(" · ")
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/(property="og:title" content=")[^"]*/, `$1${esc(title)}`)
      .replace(/(property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
      .replace(/(property="og:url" content=")[^"]*/, `$1https://irlpass.xyz/d/${esc(id)}`)
      .replace(/(name="description" content=")[^"]*/, `$1${esc(desc)}`)
      .replace(/(name="twitter:title" content=")[^"]*/, `$1${esc(title)}`)
      .replace(/(name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`)
  }
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.setHeader("cache-control", "public, max-age=300")
  return res.status(200).send(html)
}
