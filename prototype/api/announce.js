import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { actsAsMod } from "./_mods.js"
import { today } from "./_access.js"
import { cityLabel } from "./_cities.js"
import { sendEmail, shuffleEmail } from "./_email.js"

// the v3 announcement (the shuffle + starter kit + home-screen pings), in
// batches so the sending domain stays healthy. medellín people go first (edc).
// mods only. GET = audience + what's left. POST { t, only?: "medellin" } = next batch.
// who's been sent lives in app_settings ("announce:v3"), so nobody gets it twice.
export const config = { maxDuration: 300 }
const KEY = "announce:v3"
const BATCH = 40

async function sentSet() {
  const { data } = await db.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  try { return new Set(JSON.parse(data?.value || "[]")) } catch { return new Set() }
}

async function audience() {
  const [{ data: members }, { data: trips }] = await Promise.all([
    db.from("members").select("member_no, name, email, token, notify, banned, city, home_city").lt("member_no", "900").eq("banned", false),
    db.from("trips").select("member_no, city, starts, ends").gte("ends", today()).eq("hidden", false).order("starts"),
  ])
  const next = new Map()
  for (const t of trips || []) if (!next.has(t.member_no)) next.set(t.member_no, t)
  const mde = new Set((trips || []).filter((t) => t.city === "medellin" && t.starts <= "2026-10-11" && t.ends >= "2026-10-10").map((t) => t.member_no))
  return (members || [])
    .filter((m) => m.email && m.notify !== false)
    .map((m) => ({ ...m, trip: next.get(m.member_no) || null, edc: mde.has(m.member_no) }))
    // edc people first, then anyone with dates coming up, then everyone else
    .sort((a, b) => b.edc - a.edc || !!b.trip - !!a.trip)
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!actsAsMod(me)) return res.status(401).json({ error: "mods only" })
  try {
    const [all, done] = await Promise.all([audience(), sentSet()])
    let todo = all.filter((m) => !done.has(m.member_no))
    if (req.body?.only === "medellin") todo = todo.filter((m) => m.edc)
    // test: just me, nothing marked as sent
    const test = req.body?.test === true
    if (test) todo = all.filter((m) => m.member_no === me.memberNo).map((m) => ({ ...m, edc: true }))
    if (req.method === "GET") {
      return res.status(200).json({ audience: all.length, edc: all.filter((m) => m.edc).length, sent: done.size, left: todo.length })
    }
    const sent = []
    const failed = []
    for (const m of todo.slice(0, BATCH)) {
      const base = `https://irlpass.xyz/?screen=app&t=${m.token}`
      const city = m.trip?.city || m.home_city || null
      const mail = await sendEmail({
        to: m.email,
        ...shuffleEmail({
          name: m.name,
          memberNo: m.member_no,
          url: `${base}&go=now-surprise`,
          kitUrl: base,
          city: city ? cityLabel(city) : null,
          edc: m.edc,
          unsub: `https://irlpass.xyz/api/notify-off?t=${m.token}`,
        }),
        unsub: `https://irlpass.xyz/api/notify-off?t=${m.token}`,
      })
      if (mail.sent) { sent.push(m.member_no); if (!test) done.add(m.member_no) }
      else failed.push({ memberNo: m.member_no, why: mail.reason })
      await new Promise((r) => setTimeout(r, 600)) // resend rate limit
    }
    await db.from("app_settings").upsert({ key: KEY, value: JSON.stringify([...done]), updated_at: new Date().toISOString() }, { onConflict: "key" })
    return res.status(200).json({ sent: sent.length, failed, left: todo.length - sent.length })
  } catch (e) {
    console.error("announce error:", e)
    return res.status(500).json({ error: "send failed" })
  }
}
