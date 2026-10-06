// every 5 minutes: wake the busy endpoints so a real person never waits on a
// cold start (the first hit after a quiet stretch was taking 4-5s). no token
// needed: a quick 401 still spins the function up.
const HOT = ["me", "trips", "dm", "unread", "members", "mood", "person", "now", "world", "messages", "nights", "rides"]

export default async function handler(req, res) {
  const fromCron = !!req.headers?.["x-vercel-cron"]
  if (!fromCron && req.query?.key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "not allowed" })
  const base = `https://${req.headers.host || "irlpass.xyz"}`
  const t0 = Date.now()
  await Promise.all(HOT.map((p) => fetch(`${base}/api/${p}`).catch(() => null)))
  return res.status(200).json({ warmed: HOT.length, ms: Date.now() - t0 })
}
