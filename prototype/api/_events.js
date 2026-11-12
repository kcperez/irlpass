import { db } from "./_db.js"

// the cities we seed every week. luma finds events by coordinates, eventbrite
// by its own city path.
export const EVENT_CITIES = [
  { slug: "miami", lat: 25.7617, lng: -80.1918, eb: "fl--miami", ra: 38, tz: "America/New_York" },
  { slug: "new-york", lat: 40.7128, lng: -74.006, eb: "ny--new-york", ra: 8, tz: "America/New_York" },
  { slug: "los-angeles", lat: 34.0522, lng: -118.2437, eb: "ca--los-angeles", ra: 23, tz: "America/Los_Angeles" },
  { slug: "medellin", lat: 6.2442, lng: -75.5812, eb: "colombia--medellín", ra: 374, tz: "America/Bogota" },
  { slug: "palermo", lat: 38.1157, lng: 13.3615, eb: "italy--palermo", ra: 302, raOnly: /palermo/i, tz: "Europe/Rome" },
]

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
const DAYS_AHEAD = 14

// what kind of night is it. first match wins, so the specific ones lead.
const KINDS = [
  ["run", /\b(run|runs|running|5k|10k|half marathon|marathon|jog|run club|trot|corsa|carrera|correr)\b/i],
  ["wellness", /\b(yoga|pilates|wellness|meditat|breathwork|sound bath|sauna|cold plunge|fitness|workout|hike|hiking|matcha|retreat|yoga|bienestar|benessere)\b/i],
  ["party", /\b(party|rave|dj|club night|techno|house music|afterparty|nightlife|disco|reggaeton|fiesta|rumba|festa|serata|bar crawl)\b/i],
  ["music", /\b(concert|live music|jazz|band|festival|salsa|zouk|bachata|dance|concierto|concerto|musica|música)\b/i],
  ["food", /\b(dinner|brunch|supper|tasting|wine|food|coffee|cocktail|degustazione|aperitivo|cena|pranzo|vino|cata|comida)\b/i],
  ["art", /\b(art|gallery|exhibit|museum|film|cinema|theater|theatre|poetry|book|mostra|arte|cine|teatro|libro)\b/i],
  ["tech", /\b(ai|startup|founder|tech|hackathon|developer|web3|crypto|workshop|build day|claude|pitch)\b/i],
]
export const kindOf = (title, extra = "") => (KINDS.find(([, re]) => re.test(`${title} ${extra}`)) || ["social"])[0]

// tours and webinars aren't nights out with people
const SKIP = /\b(tour|tours|webinar|online|virtual|zoom|livestream|class pass|certification|course)\b/i

export async function luma(c) {
  const out = []
  let cursor = ""
  for (let page = 0; page < 4; page++) {
    const u = `https://api.lu.ma/discover/get-paginated-events?pagination_limit=50&latitude=${c.lat}&longitude=${c.lng}${cursor ? `&pagination_cursor=${encodeURIComponent(cursor)}` : ""}`
    const r = await fetch(u, { headers: { "user-agent": UA } })
    if (!r.ok) break
    const d = await r.json()
    for (const x of d.entries || []) {
      const e = x.event || {}
      if (e.location_type && e.location_type !== "offline") continue
      const geo = e.geo_address_info || {}
      const price = x.ticket_info?.price
      out.push({
        source: "luma",
        source_id: e.api_id,
        city: c.slug,
        title: e.name,
        starts_at: e.start_at,
        ends_at: e.end_at || null,
        venue: geo.address || geo.city || null,
        address: geo.full_address || geo.city_state || null,
        lat: e.coordinate?.latitude ?? null,
        lng: e.coordinate?.longitude ?? null,
        cover: e.cover_url || null,
        url: e.url ? `https://luma.com/${e.url}` : null,
        price_cents: price?.cents ?? null,
        currency: price?.currency || null,
        is_free: x.ticket_info?.is_free ?? null,
        guests: x.guest_count ?? null,
        host: x.calendar?.name || x.hosts?.[0]?.name || null,
      })
    }
    if (!d.has_more || !d.next_cursor) break
    cursor = d.next_cursor
  }
  return out
}

export async function eventbrite(c) {
  const out = []
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(`https://www.eventbrite.com/d/${encodeURI(c.eb)}/all-events/?page=${page}`, { headers: { "user-agent": UA } })
    if (!r.ok) break
    const html = await r.text()
    let n = 0
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let d
      try { d = JSON.parse(m[1]) } catch { continue }
      for (const it of d?.itemListElement || []) {
        const e = it.item || {}
        if (!e.url || !e.startDate) continue
        n++
        const id = (e.url.match(/-(\d+)(?:\?|$)/) || [])[1] || e.url
        const loc = e.location || {}
        const addr = loc.address || {}
        const offer = Array.isArray(e.offers) ? e.offers[0] : e.offers
        const low = offer?.lowPrice ?? offer?.price
        out.push({
          source: "eventbrite",
          source_id: String(id),
          city: c.slug,
          title: e.name,
          starts_at: new Date(e.startDate).toISOString(),
          ends_at: e.endDate ? new Date(e.endDate).toISOString() : null,
          venue: loc.name || null,
          address: [addr.streetAddress, addr.addressLocality].filter(Boolean).join(", ") || null,
          lat: loc.geo?.latitude ? Number(loc.geo.latitude) : null,
          lng: loc.geo?.longitude ? Number(loc.geo.longitude) : null,
          cover: Array.isArray(e.image) ? e.image[0] : e.image || null,
          url: e.url.split("?")[0],
          price_cents: low != null && !isNaN(Number(low)) ? Math.round(Number(low) * 100) : null,
          currency: offer?.priceCurrency || null,
          is_free: low != null ? Number(low) === 0 : null,
          guests: null,
          host: e.organizer?.name || null,
        })
      }
    }
    if (!n) break
  }
  return out
}

// resident advisor lists times in the city's local clock: turn them into utc
function localToUtc(local, tz) {
  const guess = Date.parse(`${local.slice(0, 19)}Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]))
  const asLocal = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return new Date(guess - (asLocal - guess)).toISOString()
}

// nightlife: resident advisor's own listings api, one area per city
export async function residentAdvisor(c) {
  if (!c.ra) return []
  const out = []
  const from = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + DAYS_AHEAD * 864e5).toISOString().slice(0, 10)
  for (let page = 1; page <= 3; page++) {
    const r = await fetch("https://ra.co/graphql", {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/json", referer: "https://ra.co/events" },
      body: JSON.stringify({
        query: "query($f: FilterInputDtoInput, $p: Int){ eventListings(filters: $f, pageSize: 50, page: $p){ totalResults data{ event{ id title startTime endTime contentUrl images{ filename } venue{ name address } attending } } } }",
        variables: { p: page, f: { areas: { eq: c.ra }, listingDate: { gte: `${from}T00:00:00.000Z`, lte: `${to}T00:00:00.000Z` } } },
      }),
    })
    if (!r.ok) break
    const rows = (await r.json())?.data?.eventListings?.data || []
    for (const { event: e } of rows) {
      if (!e?.startTime) continue
      if (c.raOnly && !c.raOnly.test(`${e.venue?.address || ""} ${e.venue?.name || ""}`)) continue
      out.push({
        source: "ra",
        source_id: String(e.id),
        city: c.slug,
        title: e.title,
        starts_at: localToUtc(e.startTime, c.tz),
        ends_at: e.endTime ? localToUtc(e.endTime, c.tz) : null,
        venue: e.venue?.name || null,
        address: e.venue?.address || null,
        lat: null,
        lng: null,
        cover: e.images?.[0]?.filename || null,
        url: `https://ra.co${e.contentUrl}`,
        price_cents: null,
        currency: null,
        is_free: null,
        guests: e.attending || null,
        host: null,
        forceKind: "party",
      })
    }
    if (rows.length < 50) break
  }
  return out
}

// pull every source for every city, keep the next two weeks of real nights out
export async function seedEvents() {
  const now = Date.now()
  const until = now + DAYS_AHEAD * 864e5
  const report = {}
  for (const c of EVENT_CITIES) {
    const got = (await Promise.all([luma(c).catch(() => []), eventbrite(c).catch(() => []), residentAdvisor(c).catch(() => [])])).flat()
    const keep = []
    const seen = new Set()
    for (const e of got) {
      const t = Date.parse(e.starts_at)
      if (!e.title || !t || t < now - 3 * 3600e3 || t > until) continue
      if (SKIP.test(e.title)) continue
      // the same night listed twice (luma and eventbrite) is one event
      const key = `${String(e.title).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}|${e.starts_at.slice(0, 10)}`
      if (seen.has(key)) continue
      seen.add(key)
      const { forceKind, ...row } = e
      keep.push({ ...row, title: String(e.title).slice(0, 200), category: forceKind || kindOf(e.title, e.host || ""), updated_at: new Date().toISOString() })
    }
    for (let i = 0; i < keep.length; i += 100) {
      const { error } = await db.from("events").upsert(keep.slice(i, i + 100), { onConflict: "source,source_id" })
      if (error) throw error
    }
    report[c.slug] = { found: got.length, listed: keep.length }
  }
  return report
}
