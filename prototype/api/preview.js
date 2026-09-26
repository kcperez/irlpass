import { db } from "./_db.js"
import { lockedPhoto } from "./_lib.js"
import { isValidCity, cityBySlug, cityLabel, OPEN_AT, canonicalCity } from "./_cities.js"
import { isDate, overlaps, today, foundingLeft } from "./_access.js"

// No token needed: this is the reveal a brand new person sees before they hand
// over anything. Counts are real, faces come back masked.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const { starts, ends } = req.body || {}
  // the vibes they just picked: used to rank, never to filter
  const vibes = Array.isArray(req.body?.vibes) ? req.body.vibes.slice(0, 20).map((v) => String(v).toLowerCase()) : []
  const shared = (interests) => (Array.isArray(interests) ? interests : []).filter((i) => vibes.includes(String(i).toLowerCase()))
  const city = canonicalCity(req.body?.city)
  if (!isValidCity(city)) return res.status(400).json({ error: "unknown city" })
  if (!isDate(starts) || !isDate(ends) || ends < starts) return res.status(400).json({ error: "bad dates" })

  try {
    const { data: trips } = await db
      .from("trips")
      .select("member_no, starts, ends, local")
      .eq("city", city)
      .lte("starts", ends)
      .gte("ends", starts)
      .gte("ends", today())
      .limit(200)

    const rows = (trips || []).filter((t) => overlaps(t.starts, t.ends, starts, ends))
    const nos = [...new Set(rows.map((t) => t.member_no))]

    let people = []
    if (nos.length) {
      const { data: members } = await db
        .from("members")
        .select("member_no, name, photo_url, gender, banned, interests")
        .in("member_no", nos)
      people = (members || [])
        .filter((m) => !m.banned)
        .map((m) => ({
          first: String(m.name || "").trim().split(/\s+/)[0] || "someone",
          photo: m.photo_url || null,
          gender: m.gender || null,
          shared: shared(m.interests),
        }))
        .sort((a, b) => b.shared.length - a.shared.length)
    }

    // people based in that city count too: with an empty calendar they are the
    // reason to join, so we hand back faces and a couple of names to anchor it
    const { data: cityMembers } = await db
      .from("members")
      .select("member_no, name, photo_url, gender, banned, comped, interests")
      .eq("city", city)
      .lt("member_no", "900")
      .order("member_no")
      .limit(400)
    const locals = (cityMembers || []).filter((m) => !m.banned)
    const inCity = locals.length
    // anchors first: comped founders (kevin, josh) then anyone with a photo
    // then whoever shares the most vibes with you
    const anchors = [...locals].sort(
      (a, b) =>
        (b.comped === true) - (a.comped === true) ||
        shared(b.interests).length - shared(a.interests).length ||
        (!!b.photo_url - !!a.photo_url)
    )
    const cityFaces = anchors.slice(0, 8).map((m, i) => ({
      // initial only: a stranger sees faces and numbers, never names. only the
      // first face is clear; the rest get a thumbnail too small to recognize
      first: (String(m.name || "?").trim()[0] || "?").toUpperCase(),
      photo: i === 0 ? m.photo_url || null : lockedPhoto(m.photo_url),
    }))

    // how many land on the same day you do — the line that makes it feel real
    const sameDay = rows.filter((t) => t.starts === starts).length
    const localsHere = rows.filter((t) => t.local).length
    const hereNow = rows.filter((t) => t.starts <= today() && t.ends >= today()).length

    // the payoff line: how many of the people you'd see share your vibes, and
    // which vibes come up most. on your dates first, the whole city if nobody's there.
    const pool = people.length ? people.map((p) => p.shared) : locals.map((m) => shared(m.interests))
    const vibeMatches = pool.filter((s) => s.length > 0).length
    const tally = {}
    for (const s of pool) for (const v of s) tally[String(v).toLowerCase()] = (tally[String(v).toLowerCase()] || 0) + 1
    const topShared = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([v]) => v)

    const meta = cityBySlug(city)
    const live = !!meta?.live
    // for a city that isn't open yet, the honest number is how many have asked
    const { count: asked } = live
      ? { count: 0 }
      : await db.from("trips").select("id", { count: "exact", head: true }).eq("city", city)

    return res.status(200).json({
      live,
      asked: asked || 0,
      openAt: OPEN_AT,
      cityName: cityLabel(city),
      city,
      starts,
      ends,
      count: people.length,
      women: people.filter((p) => p.gender === "woman").length,
      men: people.filter((p) => p.gender === "man").length,
      sameDay,
      locals: localsHere,
      hereNow,
      inCity,
      cityFaces,
      vibeMatches,
      topShared,
      // the people actually on those dates: first initial and photo only
      faces: people.slice(0, 8).map((p, i) => ({ first: (p.first[0] || "?").toUpperCase(), photo: i === 0 ? p.photo : lockedPhoto(p.photo) })),
      foundingLeft: await foundingLeft(),
    })
  } catch (e) {
    console.error("preview error:", e)
    return res.status(500).json({ error: "could not look that up" })
  }
}
