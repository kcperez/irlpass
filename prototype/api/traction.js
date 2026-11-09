import { db } from "./_db.js"

// irlpass.xyz/traction — a shareable traction page. aggregates only: no names,
// handles, emails or photos ever leave this function. test/staff accounts (900+)
// and banned members are left out.
const TEST = (n) => String(n) >= "900"

async function all(table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

const CITY = {
  medellin: "Medellín", miami: "Miami", "new-york": "New York", "los-angeles": "Los Angeles",
  cdmx: "Mexico City", chicago: "Chicago", toronto: "Toronto", cartagena: "Cartagena",
  bogota: "Bogotá", lisboa: "Lisbon", bali: "Bali", london: "London",
}
const cityName = (c) => CITY[c] || c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())

const monday = (iso) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  try {
    const [members, trips, messages, going] = await Promise.all([
      all("members", "member_no,city,home_city,country,accepted_at,ig_followers,banned"),
      all("trips", "member_no,city"),
      all("messages", "from_member_no,deleted"),
      all("spot_going", "member_no"),
    ])
    const M = members.filter((m) => !TEST(m.member_no) && !m.banned && m.accepted_at)
    const T = trips.filter((t) => !TEST(t.member_no))
    const Ms = messages.filter((m) => !TEST(m.from_member_no) && !m.deleted)
    const G = going.filter((g) => !TEST(g.member_no))

    const weeks = {}
    for (const m of M) weeks[monday(m.accepted_at)] = (weeks[monday(m.accepted_at)] || 0) + 1
    // fill empty weeks so the chart has no gaps
    const keys = Object.keys(weeks).sort()
    const weekly = []
    let total = 0
    if (keys.length) {
      for (let d = new Date(keys[0] + "T00:00:00Z"); d.toISOString().slice(0, 10) <= keys[keys.length - 1]; d.setUTCDate(d.getUTCDate() + 7)) {
        const k = d.toISOString().slice(0, 10)
        total += weeks[k] || 0
        weekly.push({ week: k, added: weeks[k] || 0, total })
      }
    }

    const count = (arr, f) => {
      const c = {}
      for (const x of arr) { const k = f(x); if (k) c[k] = (c[k] || 0) + 1 }
      return Object.entries(c).sort((a, b) => b[1] - a[1])
    }

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600")
    res.setHeader("X-Robots-Tag", "noindex")
    res.json({
      at: new Date().toISOString(),
      members: M.length,
      countries: new Set(M.map((m) => m.country).filter(Boolean)).size,
      cities: new Set(M.map((m) => m.home_city || m.city).filter(Boolean)).size,
      trips: T.length,
      tripPosters: new Set(T.map((t) => t.member_no)).size,
      messages: Ms.length,
      chatters: new Set(Ms.map((m) => m.from_member_no)).size,
      going: G.length,
      creators: M.filter((m) => (m.ig_followers || 0) >= 1000).length,
      weekly,
      topCities: count(M, (m) => m.home_city || m.city).slice(0, 8).map(([c, n]) => ({ city: cityName(c), n })),
      topCountries: count(M, (m) => m.country).slice(0, 6).map(([c, n]) => ({ country: c.replace(/\b\w/g, (x) => x.toUpperCase()), n })),
    })
  } catch (e) {
    res.status(500).json({ error: "stats unavailable" })
  }
}
