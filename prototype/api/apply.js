import { put } from "@vercel/blob"
import { createAcceptedMember } from "./accept.js"
import { canonicalCity } from "./_cities.js"
import { sendEmail, acceptanceEmail } from "./_email.js"
import { enrichMember } from "./_instagram.js"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const VALID_GENDERS = ["woman", "man", "nonbinary"]

// age in whole years from a YYYY-MM-DD string (null if unparseable)
function ageFrom(iso) {
  if (!iso) return null
  const b = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a -= 1
  return a
}

// OPEN onboarding. Completing the flow AUTO-ACCEPTS: this creates the member row
// and returns the token, no manual review queue. (createAcceptedMember in
// accept.js is the function that writes the row.)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" })
  }
  try {
    const {
      name, ig, email, dates, reasons, city, country,
      gender, birthday, interests, verifiedSelfie,
      allowDmFromMen, showIgToMen,
    } = req.body || {}

    if (!ig || String(ig).trim().length < 3) {
      return res.status(400).json({ error: "instagram required" })
    }
    // name is optional now — the handle is the identity until they edit it
    const displayName = String(name || ig).trim().replace(/^@+/, "")
    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ error: "valid email required" })
    }
    // 18+ gate: a confirmed checkbox, or a birthday if they gave one
    const age = ageFrom(birthday)
    if (age !== null && age < 18) {
      return res.status(403).json({ error: "you've got to be 18+ to join" })
    }
    if (age === null && req.body?.adult !== true) {
      return res.status(400).json({ error: "confirm you're 18 or older" })
    }
    if (gender && !VALID_GENDERS.includes(gender)) {
      return res.status(400).json({ error: "invalid gender" })
    }


    const cleanInterests = Array.isArray(interests)
      ? interests.slice(0, 10).map((i) => String(i).slice(0, 40))
      : []

    const record = {
      name: displayName.slice(0, 80),
      country: String(country || "").trim().slice(0, 60),
      ig: String(ig).trim().slice(0, 80),
      email: String(email).trim().toLowerCase().slice(0, 120),
      dates: String(dates || "").slice(0, 60),
      reasons: Array.isArray(reasons) ? reasons.slice(0, 10).map((r) => String(r).slice(0, 60)) : [],
      city: canonicalCity(city || "medellin"),
      gender: VALID_GENDERS.includes(gender) ? gender : null,
      birthday: birthday ? String(birthday).slice(0, 10) : null,
      interests: cleanInterests,
      verifiedSelfie: !!verifiedSelfie,
      allowDmFromMen: allowDmFromMen !== false,
      showIgToMen: showIgToMen !== false,
      submittedAt: new Date().toISOString(),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 160),
    }

    // keep an audit copy of the application (private blob)
    const safeIg = record.ig.replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 30)
    try {
      await put(`applications/${Date.now()}-${safeIg}.json`, JSON.stringify(record, null, 2), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: true,
      })
    } catch (e) {
      console.error("apply blob error:", e)
    }

    // AUTO-ACCEPT: create the member row + mint a token, instantly
    const { token, memberNo } = await createAcceptedMember({
      name: record.name,
      ig: record.ig,
      email: record.email,
      country: record.country,
      reasons: record.reasons,
      dates: record.dates,
      city: record.city,
      gender: record.gender,
      birthday: record.birthday,
      interests: record.interests,
      verifiedSelfie: record.verifiedSelfie,
      allowDmFromMen: record.allowDmFromMen,
      showIgToMen: record.showIgToMen,
    })

    // pull their instagram photo and follower count in the background
    enrichMember(memberNo, record.ig).catch((e) => console.error("enrich error:", e))

    // welcome email (preserves the existing email + token mechanics)
    try {
      const url = `https://irlpass.xyz/?screen=app&t=${token}`
      await sendEmail({ to: record.email, ...acceptanceEmail({ name: record.name, memberNo, url }) })
    } catch (e) {
      console.error("apply email error:", e)
    }

    return res.status(200).json({ ok: true, token, memberNo })
  } catch (e) {
    console.error("apply error:", e)
    return res.status(500).json({ error: "could not save application" })
  }
}
