import { canonicalCity, cityLabel, nearestKnown } from "./_cities.js"

// GET ?lat=&lng= -> which city those coordinates are in.
// Used by the "use my location" button, never silently in the background.
export default async function handler(req, res) {
  const lat = Number(req.query?.lat)
  const lng = Number(req.query?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "bad coordinates" })

  try {
    const known = nearestKnown(lat, lng)
    if (known) return res.status(200).json({ slug: known, name: cityLabel(known) })

    const key = process.env.GOOGLE_MAPS_KEY
    let name = null

    if (key) {
      const r = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality|administrative_area_level_2&key=${key}`
      )
      const d = await r.json()
      const comp = d?.results?.[0]?.address_components || []
      name =
        comp.find((c) => c.types.includes("locality"))?.long_name ||
        comp.find((c) => c.types.includes("administrative_area_level_2"))?.long_name ||
        null
    }

    if (!name) {
      // openstreetmap covers us when there's no google key
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
        { headers: { "user-agent": "irlpass/1.0 (hello@irlpass.xyz)" } }
      )
      const d = await r.json()
      const a = d?.address || {}
      name = a.city || a.town || a.village || a.municipality || a.county || a.state || null
    }

    // openstreetmap hands back things like "Perímetro Urbano Medellín"
    const cleaned = String(name || "")
      .replace(/per[ií]metro urbano/i, "")
      .replace(/\b(municipality|municipio|city of|ciudad de)\b/gi, "")
      .trim()
    name = cleaned || name

    if (!name) return res.status(404).json({ error: "could not place you" })
    const slug = canonicalCity(name)
    return res.status(200).json({ slug, name: cityLabel(slug) })
  } catch (e) {
    console.error("where error:", e)
    return res.status(500).json({ error: "could not place you" })
  }
}
