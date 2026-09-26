import { backfillPhotos } from "./_instagram.js"

// Daily safety net: anyone who joined without a photo (instagram slow, handle
// typo fixed later) gets another pull. Only fills blanks, never replaces.
export const config = { maxDuration: 300 }

export default async function handler(req, res) {
  const auth = req.headers?.authorization || ""
  const fromVercelCron = !!req.headers?.["x-vercel-cron"]
  const manualKey = req.query?.key && req.query.key === process.env.ADMIN_KEY
  if (!fromVercelCron && !manualKey && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "not allowed" })
  }
  try {
    return res.status(200).json(await backfillPhotos())
  } catch (e) {
    console.error("cron photos error:", e)
    return res.status(500).json({ error: "backfill failed" })
  }
}
