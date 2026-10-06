import webpush from "web-push"
import { db } from "./_db.js"

// flo-style check-ins: a few times a day, at each person's own local time,
// one question ("hungry?"). tap it and the picks are already waiting.
// runs hourly at :30. each device gets each moment at most once a day.
const MOMENTS = [
  { hour: 9, feeling: "coffee", title: "good morning ☕", body: "coffee? tap and we'll find what's open near you" },
  { hour: 12, feeling: "hungry", title: "hungry? 🍜", body: "three spots open near you, one tap" },
  { hour: 17, feeling: "drinks", title: "golden hour 🍸", body: "drinks somewhere good? tap for three picks" },
  { hour: 21, feeling: "dance", title: "going out tonight? 🪩", body: "see what's open late and who from irlpass is going" },
]

export default async function handler(req, res) {
  const fromCron = !!req.headers?.["x-vercel-cron"]
  const manual = req.query?.key && req.query.key === process.env.ADMIN_KEY
  if (!fromCron && !manual) return res.status(401).json({ error: "not allowed" })
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(200).json({ skipped: "no push keys" })
  webpush.setVapidDetails("mailto:hello@irlpass.xyz", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

  const { data: subs } = await db.from("push_subs").select("endpoint, member_no, keys")
  const nos = [...new Set((subs || []).map((s) => s.member_no))]
  const { data: people } = nos.length ? await db.from("members").select("member_no, token, banned").in("member_no", nos) : { data: [] }
  const tokenOf = new Map((people || []).filter((p) => !p.banned).map((p) => [p.member_no, p.token]))

  let sent = 0
  for (const s of subs || []) {
    const tz = s.keys?.tz
    const token = tokenOf.get(s.member_no)
    if (!tz || !token) continue
    let hour, date
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]))
      hour = Number(parts.hour)
      date = `${parts.year}-${parts.month}-${parts.day}`
    } catch { continue }
    const m = MOMENTS.find((x) => x.hour === hour)
    if (!m) continue
    const mark = `${date}:${m.feeling}`
    if (s.keys?.sent === mark) continue
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
        JSON.stringify({ title: m.title, body: m.body, tag: "checkin", url: `https://irlpass.xyz/?screen=app&t=${token}&go=now-${m.feeling}` }),
        { TTL: 1800 }
      )
      await db.from("push_subs").update({ keys: { ...s.keys, sent: mark } }).eq("endpoint", s.endpoint)
      sent++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint)
    }
  }
  return res.status(200).json({ sent })
}
