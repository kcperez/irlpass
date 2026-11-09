import { getUser } from "./_lib.js"
import { cityLabel, isValidCity } from "./_cities.js"
import { ensureBrief, isStale } from "./_brief.js"
import { waitUntil } from "@vercel/functions"
import { db } from "./_db.js"
import { cityInfo } from "./_place.js"
import { storePhoto } from "./_guide.js"

// the starter kit card's thumbnail: the city's own photo (wikipedia's lead
// image), looked up once and kept
export async function cityPhoto(city) {
  const key = `cityphoto:${city}`
  const { data: row } = await db.from("app_settings").select("value").eq("key", key).maybeSingle()
  // kept copies live in our storage. older rows point at wikimedia directly
  // (their 720px size now 400s), so those get redone below
  if (row && (!row.value || row.value.includes("/storage/v1/"))) return row.value || null
  const info = await cityInfo(city)
  const ua = { "user-agent": "irlpass/1.0 (hello@irlpass.xyz)" }
  let url = null
  for (const title of [info.name, `${info.name}, ${info.country}`]) {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: ua }).catch(() => null)
    const d = r?.ok ? await r.json().catch(() => null) : null
    const src = d?.type !== "disambiguation" ? d?.thumbnail?.source || d?.originalimage?.source : null
    if (src && !/flag|coat_of_arms|map|locator|seal|logo/i.test(src)) {
      // wikimedia only serves its standard thumb widths (960 is one), then we
      // keep our own copy so the card never depends on their cdn
      const wiki = src.replace(/\/\d+px-/, "/960px-").replace(/\?.*$/, "")
      url = await storePhoto(wiki, `cities/${city}.jpg`, ua) || await storePhoto(d?.originalimage?.source, `cities/${city}.jpg`, ua)
      if (url) break
    }
  }
  await db.from("app_settings").upsert({ key, value: url || "", updated_at: new Date().toISOString() }, { onConflict: "key" })
  return url
}

// GET ?t=&city=slug -> { city, name, brief: { headline, sections: [{ key, title, items: [{ name?, text }] }] } }
export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const city = String(req.query?.city || "")
  if (!isValidCity(city)) return res.status(400).json({ error: "which city?" })
  try {
    if (req.query?.photo) return res.status(200).json({ photo: await cityPhoto(city).catch(() => null) })
    const brief = await ensureBrief(city)
    if (!brief) return res.status(503).json({ error: "starter kits aren't on yet" })
    // old format: show it cleaned now, remake it in the new one behind the scenes
    if (isStale(brief)) waitUntil(ensureBrief(city, { force: true }).catch((e) => console.error("kit remake:", e)))
    res.setHeader("cache-control", isStale(brief) ? "no-store" : "private, max-age=3600")
    const photo = await cityPhoto(city).catch(() => null)
    return res.status(200).json({ city, name: cityLabel(city), brief, photo })
  } catch (e) {
    console.error("brief error:", e)
    return res.status(502).json({ error: "couldn't put that together right now" })
  }
}
