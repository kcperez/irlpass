import { cityBySlug } from "./_cities.js"

// the medellín spots members actually type, resolved instantly without asking anyone
const MDE_ALIASES = [
  { match: /lleras/, name: "parque lleras, el poblado", lat: 6.2096, lng: -75.5669 },
  { match: /provenza/, name: "provenza, el poblado", lat: 6.2093, lng: -75.5656 },
  { match: /comuna\s*13|graffiti/, name: "comuna 13", lat: 6.2496, lng: -75.619 },
  { match: /pueblito/, name: "pueblito paisa", lat: 6.2353, lng: -75.5801 },
  { match: /estadio/, name: "estadio, laureles", lat: 6.2566, lng: -75.5906 },
  { match: /guatap/, name: "guatapé", lat: 6.2342, lng: -75.1592 },
  { match: /poblado park|parque (de )?el poblado/, name: "parque el poblado", lat: 6.2118, lng: -75.5713 },
  { match: /laureles/, name: "laureles", lat: 6.2459, lng: -75.5916 },
  { match: /envigado/, name: "envigado", lat: 6.1696, lng: -75.5856 },
]

// build a ~0.35° viewbox around a city center for nominatim bias
const viewboxAround = (lat, lng, pad = 0.35) =>
  `${lng - pad},${lat + pad},${lng + pad},${lat - pad}`

// google places (new) text search, biased to the city. returns [] on any failure
// so we can fall through to nominatim instead of erroring the create flow.
async function googlePlaces(q, city, key) {
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
        "x-goog-fieldmask": "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: `${q}, ${city.name}`,
        pageSize: 5,
        locationBias: {
          circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 40000 },
        },
      }),
    })
    const data = await r.json()
    if (!r.ok) {
      console.error("places error:", data.error?.message)
      return []
    }
    return (data.places || [])
      .filter((p) => p.location)
      .map((p) => ({
        name: String(p.displayName?.text || q).toLowerCase(),
        address: String(p.formattedAddress || "").split(",").slice(0, 2).join(",").trim(),
        lat: p.location.latitude,
        lng: p.location.longitude,
      }))
      // keep results roughly in the city — text search sometimes wanders continents
      .filter((p) => Math.abs(p.lat - city.lat) < 1.2 && Math.abs(p.lng - city.lng) < 1.2)
  } catch (e) {
    console.error("places error:", e)
    return []
  }
}

// nominatim fallback (no key needed). same shape as googlePlaces.
async function osmPlaces(q, city) {
  const search = async (query, bounded) => {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "5",
      viewbox: viewboxAround(city.lat, city.lng),
      bounded: bounded ? "1" : "0",
      addressdetails: "0",
    })
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "user-agent": "irlpass.xyz (kevincastroperez@gmail.com)" },
    })
    const data = await r.json()
    return Array.isArray(data) ? data : []
  }
  // pass 1: hard-bounded to the city. pass 2: name + city, sanity-check distance
  let hits = await search(q, true)
  if (!hits.length) {
    hits = (await search(`${q}, ${city.name}`, false)).filter(
      (h) => Math.abs(parseFloat(h.lat) - city.lat) <= 0.4 && Math.abs(parseFloat(h.lon) - city.lng) <= 0.5
    )
  }
  return hits.map((h) => ({
    name: String(h.display_name || q).split(",").slice(0, 2).join(",").toLowerCase(),
    address: String(h.display_name || "").split(",").slice(2, 4).join(",").trim(),
    lat: parseFloat(h.lat),
    lng: parseFloat(h.lon),
  }))
}

// GET ?q=pueblito paisa&city=medellin -> google-maps place matches biased to that
// city. `suggestions` populates the picker; found/name/lat/lng stay for back-compat.
export default async function handler(req, res) {
  const q = String(req.query?.q || "").trim()
  if (q.length < 3) return res.status(400).json({ error: "too short" })

  // which city are we searching in? defaults to medellín (the live city)
  const city = cityBySlug(req.query?.city) || cityBySlug("medellin")

  // instant aliases only make sense for medellín neighborhoods
  if (city.slug === "medellin") {
    const norm = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    const alias = MDE_ALIASES.find((a) => a.match.test(norm))
    if (alias) {
      res.setHeader("cache-control", "s-maxage=86400")
      return res.status(200).json({
        found: true, name: alias.name, lat: alias.lat, lng: alias.lng,
        suggestions: [{ name: alias.name, address: "", lat: alias.lat, lng: alias.lng }],
      })
    }
  }

  try {
    const key = process.env.GOOGLE_MAPS_KEY
    let suggestions = key ? await googlePlaces(q, city, key) : []
    if (!suggestions.length) suggestions = await osmPlaces(q, city)
    if (!suggestions.length) return res.status(200).json({ found: false, suggestions: [] })
    const best = suggestions[0]
    res.setHeader("cache-control", "s-maxage=86400")
    return res.status(200).json({ found: true, name: best.name, lat: best.lat, lng: best.lng, suggestions })
  } catch (e) {
    console.error("geocode error:", e)
    return res.status(200).json({ found: false, suggestions: [] })
  }
}
