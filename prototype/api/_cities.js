// the cities irlpass knows about. medellin is the live, seeded city; the rest are
// browseable shells until we seed them. slugs are the canonical city id stored on
// activities and on the member's current city.
export const CITIES = [
  { slug: "medellin", name: "Medellín", country: "Colombia", lat: 6.2442, lng: -75.5812, live: true },
  { slug: "cdmx", name: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332, live: false },
  { slug: "miami", name: "Miami", country: "USA", lat: 25.7617, lng: -80.1918, live: false },
  { slug: "lisboa", name: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393, live: false },
  { slug: "bali", name: "Bali", country: "Indonesia", lat: -8.4095, lng: 115.1889, live: false },
]

export const CITY_SLUGS = CITIES.map((c) => c.slug)
export const isCity = (slug) => CITY_SLUGS.includes(String(slug))
export const cityBySlug = (slug) => CITIES.find((c) => c.slug === String(slug)) || null

// haversine-ish nearest city to a coordinate. used to turn phone GPS into a city
// slug so "your current city" = where your phone physically is.
export function nearestCity(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null
  let best = null
  let bestD = Infinity
  for (const c of CITIES) {
    const dLat = (c.lat - lat) * 111
    const dLng = (c.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180)
    const d = Math.hypot(dLat, dLng) // rough km
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  // only call it "your city" if you're within ~150km of its center
  return best && bestD <= 150 ? best : null
}

// a city opens once this many people have posted dates for it. until then it
// collects them: every "request" is a real trip, so an opened city starts full.
export const OPEN_AT = Number(process.env.CITY_OPEN_AT || 10)

// v2: anywhere is allowed. known cities carry metadata (map centre, live flag);
// anything else becomes a clean slug and fills up until it hits OPEN_AT.
export const slugifyCity = (name) =>
  String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)

export const isValidCity = (slug) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(String(slug || ""))

export const cityLabel = (slug) =>
  cityBySlug(slug)?.name ||
  String(slug || "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")

// people type the same place a dozen ways. everything funnels to one slug, or
// overlapping trips never find each other.
const ALIASES = {
  "mexico-city": "cdmx", "ciudad-de-mexico": "cdmx", "mexico-df": "cdmx", "df": "cdmx", "mexico": "cdmx",
  "medellin": "medellin", "medellín": "medellin", "poblado": "medellin", "el-poblado": "medellin",
  "laureles": "medellin", "envigado": "medellin", "colombia": "medellin",
  "bogota": "bogota", "bogotá": "bogota",
  "cartegena": "cartagena", "cartajena": "cartagena",
  "cali": "cali",
  "cdmx": "cdmx",
  "lisbon": "lisboa", "lisabon": "lisboa",
  "nyc": "new-york", "new-york-city": "new-york", "ny": "new-york",
  "la": "los-angeles", "cdmx-mexico": "cdmx",
  "bali-indonesia": "bali", "canggu-bali": "canggu",
  "buenos-aires-argentina": "buenos-aires",
  "rio": "rio-de-janeiro", "sao-paolo": "sao-paulo",
  "seoul-korea": "seoul", "south-korea": "seoul",
  "bkk": "bangkok", "cm": "chiang-mai",
  "uk": "london", "england": "london",
}

export const canonicalCity = (input) => {
  const slug = slugifyCity(input)
  return ALIASES[slug] || slug
}
