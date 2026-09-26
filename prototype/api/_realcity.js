import { canonicalCity, CITIES } from "./_cities.js"
import { db } from "./_db.js"
import { CITY_INDEX } from "../src/lib/cities.js"

// only real places get a city. typed text is checked against openstreetmap:
// "coimbatore" is a city, "coim" is an office building, so it isn't.
const PLACE_TYPES = new Set(["city", "town", "municipality", "island", "archipelago", "country"])
const KNOWN = new Set([...CITY_INDEX.map((c) => c.slug), ...CITIES.map((c) => c.slug)])
const cache = new Map() // slug -> true/false, per warm instance
const meta = new Map() // slug -> { name, country, emoji } from the last search

// places osm files under another country's code but that fly their own flag
const OWN_FLAG = { aruba: "aw", "curaçao": "cw", curacao: "cw", "puerto rico": "pr", "sint maarten": "sx", greenland: "gl" }
const flagFor = (p) => flag(OWN_FLAG[String(p.address?.country || "").toLowerCase()] || p.address?.country_code)

const flag = (cc) =>
  cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "📍"

// big administrative areas count when they're clearly a city (barranquilla is
// filed as a county, brussels as "administrative")
const BIG_TYPES = new Set(["county", "administrative", "state_district", "province", "state"])

async function nominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=10&accept-language=en`
  const r = await fetch(url, { headers: { "user-agent": "irlpass.xyz (hello@irlpass.xyz)" } })
  if (!r.ok) throw new Error(`nominatim ${r.status}`)
  return (await r.json()) || []
}

const isPlace = (p) =>
  PLACE_TYPES.has(p.addresstype) ||
  (p.addresstype === "village" && Number(p.importance) >= 0.35) ||
  (BIG_TYPES.has(p.addresstype) && Number(p.importance) >= 0.5)

// the name people call it: the address's city beats osm's official label
// ("Perímetro Urbano Barranquilla" -> "Barranquilla")
const placeName = (p) =>
  p.address?.city || p.address?.town || p.address?.municipality || p.address?.island || p.name

export async function searchRealCities(q, limit = 6) {
  const query = String(q || "").trim().slice(0, 60)
  if (query.length < 2) return []
  const out = []
  const seen = new Set()
  for (const p of await nominatim(query)) {
    if (!isPlace(p)) continue
    const name = placeName(p)
    if (!name) continue
    const slug = canonicalCity(name)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    cache.set(slug, true)
    const row = { slug, name, country: p.address?.country || "", emoji: flagFor(p) }
    if (!meta.has(slug)) meta.set(slug, row)
    out.push(row)
    if (out.length >= limit) break
  }
  return out
}

export async function isRealCity(slug) {
  const s = String(slug || "")
  if (KNOWN.has(s)) return true
  if (cache.has(s)) return cache.get(s)
  try {
    const rows = await nominatim(s.replace(/-/g, " "))
    // a real place whose name is, or plainly contains, what they picked
    // ("bruxelles" -> "Bruxelles - Brussel")
    const hit = rows.find((p) => isPlace(p) && (canonicalCity(placeName(p)) === s || canonicalCity(p.name).includes(s)))
    if (hit && !meta.has(s)) {
      meta.set(s, { slug: s, name: placeName(hit), country: hit.address?.country || "", emoji: flagFor(hit) })
    }
    cache.set(s, !!hit)
    return !!hit
  } catch {
    // the lookup service being down shouldn't block someone posting dates
    return true
  }
}

// once a city is actually used (dates posted, a request logged), keep its name
// and flag so every room and chip can show it. first write wins.
export async function saveCity(slug) {
  if (KNOWN.has(slug)) return
  let row = meta.get(slug)
  if (!row && (await isRealCity(slug))) row = meta.get(slug)
  if (!row) return
  await db.from("cities").upsert(row, { onConflict: "slug", ignoreDuplicates: true }).then(() => {}, () => {})
}
