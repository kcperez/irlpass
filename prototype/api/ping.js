import { db } from "./_db.js"

// GET -> how long one database round trip takes from where this function runs
// (tells us if vercel and supabase sit in the same region)
export default async function handler(req, res) {
  const t0 = Date.now()
  await db.from("app_settings").select("key").limit(1)
  const t1 = Date.now()
  await db.from("app_settings").select("key").limit(1)
  const t2 = Date.now()
  res.setHeader("cache-control", "no-store")
  return res.status(200).json({ first: t1 - t0, second: t2 - t1, region: process.env.VERCEL_REGION || null })
}
