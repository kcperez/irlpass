import { put } from "@vercel/blob"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" })
  }
  try {
    const { name, ig, email, dates, reasons, city, country } = req.body || {}

    if (!name || !String(name).trim() || String(name).trim().length < 2) {
      return res.status(400).json({ error: "name required" })
    }
    if (!ig || String(ig).trim().length < 3) {
      return res.status(400).json({ error: "instagram required" })
    }
    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ error: "valid email required" })
    }
    if (!dates) {
      return res.status(400).json({ error: "dates required" })
    }

    const record = {
      name: String(name).trim().slice(0, 80),
      country: String(country || "").trim().slice(0, 60),
      ig: String(ig).trim().slice(0, 80),
      email: String(email).trim().toLowerCase().slice(0, 120),
      dates: String(dates).slice(0, 60),
      reasons: Array.isArray(reasons) ? reasons.slice(0, 10).map((r) => String(r).slice(0, 60)) : [],
      city: String(city || "medellin").slice(0, 40),
      submittedAt: new Date().toISOString(),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 160),
    }

    const safeIg = record.ig.replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 30)
    await put(`applications/${Date.now()}-${safeIg}.json`, JSON.stringify(record, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: true,
    })

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("apply error:", e)
    return res.status(500).json({ error: "could not save application" })
  }
}
