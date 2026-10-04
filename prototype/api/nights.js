import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isValidCity } from "./_cities.js"
import { tonight } from "./mood.js"

// josh's coordination prompt. daily: "out tonight?" (one tap fills tonight's
// board). sunday through wednesday: "which nights are you down this week?".
// both can be skipped, and a skip counts as an answer so it never nags twice.
// GET  ?t=           -> { ask: "tonight" | "week" | null, tonight, week: [dates] }
// POST { t, nights: [date], answer: "out" | "skip" | "pass" (skipped the weekly), city }
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// the coming thursday through sunday (the weekend people actually plan)
function weekNights(night) {
  const dow = new Date(`${night}T00:00:00Z`).getUTCDay() // 0 sun .. 6 sat
  const toThu = (4 - dow + 7) % 7
  const thu = addDays(night, toThu)
  return [0, 1, 2, 3].map((i) => addDays(thu, i))
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const night = tonight()

  try {
    if (req.method === "GET") {
      const dow = new Date(`${night}T00:00:00Z`).getUTCDay()
      const week = [0, 1, 2, 3].includes(dow) ? weekNights(night) : []
      const { data: rows } = await db.from("night_plans").select("night, answer").eq("member_no", me.memberNo).gte("night", night)
      const answered = Object.fromEntries((rows || []).map((r) => [r.night, r.answer]))
      // a skipped weekly prompt is stored as "pass", which still lets the daily one ask
      const ask = !answered[night] || answered[night] === "pass" ? "tonight" : week.length && !week.some((d) => answered[d]) ? "week" : null
      return res.status(200).json({ ask, tonight: night, week, answered })
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const answer = ["out", "skip", "pass"].includes(req.body?.answer) ? req.body.answer : "skip"
    const city = isValidCity(req.body?.city) ? req.body.city : "medellin"
    const nights = (Array.isArray(req.body?.nights) ? req.body.nights : [])
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= night && d <= addDays(night, 10))
      .slice(0, 7)
    if (!nights.length) return res.status(400).json({ error: "which nights?" })
    const rows = nights.map((d) => ({ member_no: me.memberNo, night: d, city, answer, created_at: new Date().toISOString() }))
    const { error } = await db.from("night_plans").upsert(rows, { onConflict: "member_no,night" })
    if (error) throw error
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("nights error:", e)
    return res.status(500).json({ error: "couldn't save that" })
  }
}
