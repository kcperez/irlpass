import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isValidCity, canonicalCity } from "./_cities.js"
import { today } from "./_access.js"

// A year of a city at a glance: how many people are there each day, so you can
// move your own dates to where the people are.
export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const city = canonicalCity(req.query?.city)
  if (!isValidCity(city)) return res.status(400).json({ error: "unknown city" })

  try {
    const from = today()
    const to = addDays(from, 365)
    const { data: trips } = await db
      .from("trips")
      .select("member_no, starts, ends, local")
      .eq("city", city)
      .lte("starts", to)
      .gte("ends", from)
      .limit(500)

    const days = {}
    const mine = {}
    for (const t of trips || []) {
      const target = t.member_no === me.memberNo ? mine : days
      for (const d of eachDay(max(t.starts, from), min(t.ends, to))) {
        target[d] = (target[d] || 0) + 1
      }
    }

    // the weeks worth flying for
    const busiest = Object.entries(days)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 3)
      .map(([day, people]) => ({ day, people }))

    return res.status(200).json({ city, from, to, days, mine, busiest })
  } catch (e) {
    console.error("calendar error:", e)
    return res.status(500).json({ error: "could not load the year" })
  }
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function eachDay(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}
const max = (a, b) => (a > b ? a : b)
const min = (a, b) => (a < b ? a : b)
