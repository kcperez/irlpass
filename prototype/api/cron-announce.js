import { cronBatch } from "./announce.js"

export const config = { maxDuration: 300 }

// the v3 announcement, 40 a day (keeps the sending domain healthy)
export default async function handler(req, res) {
  const fromCron = !!req.headers?.["x-vercel-cron"]
  const manual = req.query?.key && req.query.key === process.env.ADMIN_KEY
  if (!fromCron && !manual) return res.status(401).json({ error: "not allowed" })
  try {
    return res.status(200).json(await cronBatch())
  } catch (e) {
    console.error("cron announce error:", e)
    return res.status(500).json({ error: "failed" })
  }
}
