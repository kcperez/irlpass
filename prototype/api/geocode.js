import { cityBySlug } from "./_cities.js"

// the medellín spots members actually type, resolved instantly without asking osm
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

// GET ?q=pueblito paisa&city=medellin -> best location match, biased to that city
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
      return res.status(200).json({ found: true, name: alias.name, lat: alias.lat, lng: alias.lng })
    }
  }

  try {
    const search = async (query, bounded) => {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        limit: "1",
        viewbox: viewboxAround(city.lat, city.lng),
        bounded: bounded ? "1" : "0",
        addressdetails: "0",
      })
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "user-agent": "irlpass.xyz (kevincastroperez@gmail.com)" },
      })
      const data = await r.json()
      return Array.isArray(data) && data.length ? data[0] : null
    }

    // pass 1: hard-bounded to the city. pass 2: name + city, sanity-check distance
    let hit = await search(q, true)
    if (!hit) {
      hit = await search(`${q}, ${city.name}`, false)
      if (hit && (Math.abs(parseFloat(hit.lat) - city.lat) > 0.4 || Math.abs(parseFloat(hit.lon) - city.lng) > 0.5)) hit = null
    }
    if (!hit) return res.status(200).json({ found: false })
    const name = String(hit.display_name || q).split(",").slice(0, 2).join(",").toLowerCase()
    res.setHeader("cache-control", "s-maxage=86400")
    return res.status(200).json({ found: true, name, lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) })
  } catch (e) {
    console.error("geocode error:", e)
    return res.status(200).json({ found: false })
  }
}
