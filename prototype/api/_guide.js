import sharp from "sharp"
import { db } from "./_db.js"

// the recs guide: each spot's real google maps listing (via apify), with its
// photos copied to our own storage so they never expire or hit quotas.
const ACTOR = "compass~crawler-google-places"

async function storePhoto(url, path) {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const img = await sharp(Buffer.from(await r.arrayBuffer())).rotate().resize(1200, 900, { fit: "cover" }).jpeg({ quality: 74 }).toBuffer()
    const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, "content-type": "image/jpeg", "x-upsert": "true" },
      body: img,
    })
    return up.ok ? `${process.env.SUPABASE_URL}/storage/v1/object/public/avatars/${path}?v=${Date.now()}` : null
  } catch {
    return null
  }
}

// a short, real review line: 4-5 stars, readable length, first sentence or two
const pickQuote = (reviews = []) => {
  const good = reviews
    .filter((r) => (r.stars || 0) >= 4 && r.text && r.text.length > 40)
    .map((r) => r.text.replace(/\s+/g, " ").trim())
  for (const t of good) {
    const cut = t.length > 170 ? `${t.slice(0, 170).replace(/\s+\S*$/, "")}…` : t
    return cut
  }
  return null
}

// the highlights google lists ("great cocktails", "rooftop seating"...)
const highlights = (info = {}) =>
  Object.values(info || {})
    .flat()
    .flatMap((o) => Object.entries(o || {}).filter(([, v]) => v === true).map(([k]) => k))
    .slice(0, 12)

export async function enrichSpots({ ids = null, limit = 5 } = {}) {
  const token = process.env.APIFY_TOKEN
  if (!token) return { error: "no scraper key" }
  let q = db.from("spots").select("*").eq("active", true).order("id")
  q = ids ? q.in("id", ids) : q.is("enriched_at", null)
  const { data: spots } = await q.limit(limit)
  if (!spots?.length) return { done: 0, left: 0 }

  const out = []
  for (const s of spots) {
    const search = `${s.name}, ${s.area || ""}, Medellín, Colombia`
    const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=120`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [search],
        maxCrawledPlacesPerSearch: 1,
        language: "en",
        maxImages: 6,
        maxReviews: 8,
        reviewsSort: "mostRelevant",
        scrapeReviewsPersonalData: false,
      }),
    })
    if (!r.ok) { out.push({ id: s.id, name: s.name, error: `scraper ${r.status}` }); continue }
    const p = (await r.json())?.[0]
    if (!p) { out.push({ id: s.id, name: s.name, error: "not found" }); continue }

    const urls = [p.imageUrl, ...(p.imageUrls || [])].filter(Boolean)
    const photos = []
    for (const u of [...new Set(urls)].slice(0, 4)) {
      const stored = await storePhoto(u, `spots/${s.id}-${photos.length}.jpg`)
      if (stored) photos.push(stored)
    }
    const row = {
      photos,
      rating: typeof p.totalScore === "number" ? p.totalScore : null,
      reviews: typeof p.reviewsCount === "number" ? p.reviewsCount : null,
      address: p.address || null,
      category: p.categoryName || null,
      price: p.price || null,
      website: p.website || null,
      maps_url: p.url || null,
      hours: p.openingHours || null,
      quote: pickQuote(p.reviews),
      enriched_at: new Date().toISOString(),
    }
    await db.from("spots").update(row).eq("id", s.id)
    out.push({
      id: s.id,
      name: s.name,
      found: p.title,
      photos: photos.length,
      rating: row.rating,
      category: row.category,
      neighborhood: p.neighborhood || null,
      description: p.description || null,
      highlights: highlights(p.additionalInfo),
      reviews: (p.reviews || []).filter((x) => x.text).slice(0, 5).map((x) => x.text.slice(0, 300)),
    })
  }
  const { count } = await db.from("spots").select("id", { count: "exact", head: true }).eq("active", true).is("enriched_at", null)
  return { done: out.length, left: count || 0, spots: out }
}
