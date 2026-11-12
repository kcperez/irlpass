// the cities travelers actually ask about, with their flag. anything not on the
// list still works — it just shows a pin instead of a flag.

export const CITY_INDEX = [
  ["medellin", "Medellín", "🇨🇴"], ["bogota", "Bogotá", "🇨🇴"], ["cartagena", "Cartagena", "🇨🇴"],
  ["cali", "Cali", "🇨🇴"], ["barranquilla", "Barranquilla", "🇨🇴"], ["santa-marta", "Santa Marta", "🇨🇴"],
  ["pereira", "Pereira", "🇨🇴"], ["guatape", "Guatapé", "🇨🇴"],
  ["cdmx", "Mexico City", "🇲🇽"], ["playa-del-carmen", "Playa del Carmen", "🇲🇽"], ["oaxaca", "Oaxaca", "🇲🇽"],
  ["tulum", "Tulum", "🇲🇽"], ["guadalajara", "Guadalajara", "🇲🇽"],
  ["miami", "Miami", "🇺🇸"], ["new-york", "New York", "🇺🇸"], ["los-angeles", "Los Angeles", "🇺🇸"],
  ["austin", "Austin", "🇺🇸"], ["san-francisco", "San Francisco", "🇺🇸"], ["chicago", "Chicago", "🇺🇸"],
  ["lisboa", "Lisbon", "🇵🇹"], ["porto", "Porto", "🇵🇹"], ["madrid", "Madrid", "🇪🇸"],
  ["barcelona", "Barcelona", "🇪🇸"], ["valencia", "Valencia", "🇪🇸"], ["sevilla", "Seville", "🇪🇸"],
  ["paris", "Paris", "🇫🇷"], ["london", "London", "🇬🇧"], ["berlin", "Berlin", "🇩🇪"],
  ["amsterdam", "Amsterdam", "🇳🇱"], ["rome", "Rome", "🇮🇹"], ["milan", "Milan", "🇮🇹"], ["palermo", "Palermo", "🇮🇹"],
  ["athens", "Athens", "🇬🇷"], ["split", "Split", "🇭🇷"], ["budapest", "Budapest", "🇭🇺"],
  ["prague", "Prague", "🇨🇿"], ["warsaw", "Warsaw", "🇵🇱"], ["istanbul", "Istanbul", "🇹🇷"],
  ["tbilisi", "Tbilisi", "🇬🇪"], ["dubai", "Dubai", "🇦🇪"], ["cape-town", "Cape Town", "🇿🇦"],
  ["marrakech", "Marrakech", "🇲🇦"], ["nairobi", "Nairobi", "🇰🇪"],
  ["bali", "Bali", "🇮🇩"], ["canggu", "Canggu", "🇮🇩"], ["bangkok", "Bangkok", "🇹🇭"],
  ["chiang-mai", "Chiang Mai", "🇹🇭"], ["koh-phangan", "Koh Phangan", "🇹🇭"],
  ["ho-chi-minh", "Ho Chi Minh City", "🇻🇳"], ["hanoi", "Hanoi", "🇻🇳"], ["singapore", "Singapore", "🇸🇬"],
  ["seoul", "Seoul", "🇰🇷"], ["tokyo", "Tokyo", "🇯🇵"], ["osaka", "Osaka", "🇯🇵"],
  ["taipei", "Taipei", "🇹🇼"], ["hong-kong", "Hong Kong", "🇭🇰"],
  ["buenos-aires", "Buenos Aires", "🇦🇷"], ["santiago", "Santiago", "🇨🇱"], ["lima", "Lima", "🇵🇪"],
  ["cusco", "Cusco", "🇵🇪"], ["rio-de-janeiro", "Rio de Janeiro", "🇧🇷"], ["sao-paulo", "São Paulo", "🇧🇷"],
  ["florianopolis", "Florianópolis", "🇧🇷"], ["montevideo", "Montevideo", "🇺🇾"],
  ["panama-city", "Panama City", "🇵🇦"], ["san-jose", "San José", "🇨🇷"], ["san-juan", "San Juan", "🇵🇷"],
  ["sydney", "Sydney", "🇦🇺"], ["melbourne", "Melbourne", "🇦🇺"], ["auckland", "Auckland", "🇳🇿"],
  ["toronto", "Toronto", "🇨🇦"], ["vancouver", "Vancouver", "🇨🇦"], ["montreal", "Montreal", "🇨🇦"],
].map(([slug, name, emoji]) => ({ slug, name, emoji }))

// cities with events listed every day (keep in sync with api/_events.js)
export const EVENT_CITY_SLUGS = ["miami", "new-york", "los-angeles", "medellin", "palermo"]

export const slugify = (name) =>
  String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)

const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function searchCities(q, limit = 6) {
  const needle = fold(q).trim()
  if (!needle) return []
  const starts = []
  const contains = []
  for (const c of CITY_INDEX) {
    const name = fold(c.name)
    if (name.startsWith(needle)) starts.push(c)
    else if (name.includes(needle)) contains.push(c)
  }
  return [...starts, ...contains].slice(0, limit)
}

// real cities beyond our list, with their flags: learned from the server
// (stats.cityMeta) and from whatever someone picks in a search
const EXTRA = new Map()
export const rememberCity = (c) => {
  if (c?.slug && c.name && !CITY_INDEX.some((k) => k.slug === c.slug)) {
    EXTRA.set(c.slug, { slug: c.slug, name: c.name, emoji: c.emoji || "📍" })
  }
}
export const registerCities = (meta) => {
  for (const [slug, m] of Object.entries(meta || {})) rememberCity({ slug, ...m })
}

// a typed city we don't know yet still deserves a chip
export const cityChip = (slug, typed) => {
  const known = CITY_INDEX.find((c) => c.slug === slug) || EXTRA.get(slug)
  if (known) return known
  const name = String(typed || slug || "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  return { slug, name, emoji: "📍" }
}
