import { seedEvents } from "./_events.js"

// daily: refresh what's on in every seeded city for the next two weeks
export const config = { maxDuration: 300 }

export default async function handler(req, res) {
  const auth = req.headers?.authorization || ""
  const fromVercelCron = !!req.headers?.["x-vercel-cron"]
  const manualKey = req.query?.key && req.query.key === process.env.ADMIN_KEY
  if (!fromVercelCron && !manualKey && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "not allowed" })
  }
  try {
    return res.status(200).json(await seedEvents())
  } catch (e) {
    console.error("cron events error:", e)
    return res.status(500).json({ error: e.message })
  }
}
