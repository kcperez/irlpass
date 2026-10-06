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

// query: a better search for one spot when its name alone finds the wrong place
// near: { lat, lng, name } for a spot a member added. google's top hit only
// counts when it's within 1km and shares a word with the name, so a wrong
// match leaves a plain card instead of someone else's photos.
const words = (x) => new Set(String(x || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2))
const km = (a, b) => {
  const r = Math.PI / 180
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r)
  const y = (b.lat - a.lat) * r
  return Math.sqrt(x * x + y * y) * 6371
}
export async function enrichSpots({ ids = null, limit = 5, query = null, near = null, url = null } = {}) {
  const token = process.env.APIFY_TOKEN
  if (!token) return { error: "no scraper key" }
  // named spots are checked even while hidden (new ones stay hidden until they check out)
  let q = db.from("spots").select("*").order("id")
  q = ids ? q.in("id", ids) : q.eq("active", true).is("enriched_at", null)
  const { data: spots } = await q.limit(limit)
  if (!spots?.length) return { done: 0, left: 0 }

  const out = []
  for (const s of spots) {
    const search = query && ids?.length === 1 ? query : `${s.name}, ${s.area || ""}, Medellín, Colombia`
    const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=120`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(url && ids?.length === 1 ? { startUrls: [{ url }] } : { searchStringsArray: [search] }),
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
    if (near) {
      const shared = [...words(near.name)].some((w) => words(p.title).has(w))
      const close = p.location?.lat && km(near, p.location) < 1
      if (!shared || !close) {
        await db.from("spots").update({ enriched_at: new Date().toISOString() }).eq("id", s.id)
        out.push({ id: s.id, name: s.name, error: `no match (${p.title})` })
        continue
      }
    }

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
      lat: p.location?.lat ?? null,
      lng: p.location?.lng ?? null,
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

// any place on google maps, for the mood tab's "search google maps": a few
// matches with their google ids and coordinates, no photos yet (fast)
export async function googleSearch(q) {
  const token = process.env.APIFY_TOKEN
  if (!token) return { error: "no scraper key" }
  const text = String(q || "").trim().slice(0, 200)
  if (!text) return { places: [] }
  const isLink = /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/.test(text)
  const input = isLink
    ? { startUrls: [{ url: text }], maxCrawledPlacesPerSearch: 1 }
    : { searchStringsArray: [`${text}, Medellín, Colombia`], maxCrawledPlacesPerSearch: 5 }
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=60`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, language: "en", maxImages: 0, maxReviews: 0, scrapeReviewsPersonalData: false }),
  })
  if (!r.ok) return { error: `scraper ${r.status}` }
  const items = await r.json().catch(() => [])
  return {
    places: (items || []).filter((p) => p.title && p.location?.lat).map((p) => ({
      osmId: `G${p.placeId || p.cid || p.title}`.slice(0, 40),
      name: p.title,
      kind: String(p.categoryName || "").toLowerCase(),
      area: p.neighborhood || "",
      street: p.street || p.address || "",
      lat: p.location.lat,
      lng: p.location.lng,
      mapsUrl: p.url || "",
      google: true,
    })),
  }
}

// coordinates for every spot that has a google maps link, in one scraper run
// (no photos or reviews, so it's quick). "near you" needs these.
export async function spotCoords() {
  const token = process.env.APIFY_TOKEN
  if (!token) return { error: "no scraper key" }
  const { data: spots } = await db.from("spots").select("id, maps_url").not("maps_url", "is", null).is("lat", null).limit(120)
  if (!spots?.length) return { done: 0 }
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=280`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ startUrls: spots.map((x) => ({ url: x.maps_url })), maxImages: 0, maxReviews: 0, language: "en", scrapeReviewsPersonalData: false }),
  })
  if (!r.ok) return { error: `scraper ${r.status}` }
  const items = await r.json().catch(() => [])
  // match results back by place id inside the url, then by url
  const pid = (u) => String(u || "").match(/query_place_id=([^&]+)/)?.[1] || String(u || "").match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/)?.[1] || ""
  let done = 0
  for (const sp of spots) {
    const key = pid(sp.maps_url)
    const hit = items.find((p) => (key && (p.placeId === key || pid(p.url) === key)) || p.url === sp.maps_url)
    if (hit?.location?.lat) {
      await db.from("spots").update({ lat: hit.location.lat, lng: hit.location.lng }).eq("id", sp.id)
      done++
    }
  }
  return { done, of: spots.length, scraped: items.length }
}
