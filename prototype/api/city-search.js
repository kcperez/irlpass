import { searchRealCities } from "./_realcity.js"

// GET ?q= -> real cities matching what someone typed, for the city pickers
export default async function handler(req, res) {
  try {
    const cities = await searchRealCities(req.query?.q)
    res.setHeader("cache-control", "public, max-age=86400")
    return res.status(200).json({ cities })
  } catch (e) {
    console.error("city search error:", e)
    return res.status(200).json({ cities: [] })
  }
}
