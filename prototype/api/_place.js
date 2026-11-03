import tzlookup from "tz-lookup"
import { db } from "./_db.js"
import { CITIES, cityLabel } from "./_cities.js"

// one place to ask "where is this city and what time is it there". every tab
// uses the member's current city, so the clock has to be that city's clock,
// not medellín's.
const cache = new Map() // slug -> { slug, name, country, lat, lng, tz }

export async function cityInfo(slug) {
  const s = String(slug || "medellin")
  if (cache.has(s)) return cache.get(s)
  const known = CITIES.find((c) => c.slug === s)
  let row = known ? { slug: s, name: known.name, country: known.country, lat: known.lat, lng: known.lng } : null
  if (!row) {
    const { data } = await db.from("cities").select("slug, name, country, lat, lng").eq("slug", s).maybeSingle()
    row = data ? { ...data } : { slug: s, name: cityLabel(s), country: "", lat: null, lng: null }
  }
  let tz = "America/Bogota"
  try { if (Number.isFinite(row.lat) && Number.isFinite(row.lng)) tz = tzlookup(row.lat, row.lng) } catch { /* ocean, keep default */ }
  const info = { ...row, tz }
  cache.set(s, info)
  return info
}

// the wall clock in a timezone: date (yyyy-mm-dd), weekday 0-6, minutes since midnight
export function localNow(tz, at = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(new Date(at)).map((p) => [p.type, p.value])
  )
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday)
  const hour = Number(parts.hour) % 24
  return { date: `${parts.year}-${parts.month}-${parts.day}`, day, hour, min: hour * 60 + Number(parts.minute) }
}

// "tonight" runs until 6am local, so an afters crowd at 2am is still tonight
export const nightIn = (tz) => localNow(tz, Date.now() - 6 * 3600e3).date

// the utc offset of a timezone right now, in ms (miami in winter = -5h)
export function offsetMs(tz, at = Date.now()) {
  const l = localNow(tz, at)
  const asUtc = Date.UTC(+l.date.slice(0, 4), +l.date.slice(5, 7) - 1, +l.date.slice(8, 10), l.hour, l.min % 60)
  return Math.round((asUtc - at) / 60000) * 60000
}
