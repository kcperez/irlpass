import { randomBytes } from "node:crypto"
import { list } from "@vercel/blob"
import { readJson } from "./_lib.js"
import { db } from "./_db.js"
import { sendEmail, acceptanceEmail } from "./_email.js"

// pull the full application (country, reasons, dates) by ig or email
async function findApplication(ig, email) {
  try {
    const { blobs } = await list({ prefix: "applications/", limit: 1000 })
    for (const b of blobs) {
      const a = await readJson(b.pathname)
      if (a && (a.ig === ig || String(a.email).toLowerCase() === email)) return a
    }
  } catch {}
  return null
}

// First two member numbers belong to the founders; applicants start at 003.
const MEMBER_START = 3
const VALID_GENDERS = ["woman", "man", "nonbinary"]

// Shared auto-accept: assigns the next member_no, mints a token, and writes the
// row. Used by the OPEN onboarding (api/apply.js) so completing the flow makes
// you a member instantly, and by the admin accept endpoint below. This is the
// single function that creates a member row now — no manual review gate.
export async function createAcceptedMember(input = {}) {
  const rawIg = String(input.ig || "").trim().slice(0, 80)
  const ig = rawIg.startsWith("@") ? rawIg : `@${rawIg}`
  const email = String(input.email || "").trim().toLowerCase().slice(0, 120)
  const name = String(input.name || "").trim().slice(0, 80)

  // idempotent: the same instagram is already a member -> hand the spot back
  const { data: existing } = await db.from("members").select("*").eq("ig", ig).maybeSingle()
  if (existing) {
    return { token: existing.token, memberNo: existing.member_no, existing: true }
  }

  const { count } = await db.from("members").select("*", { count: "exact", head: true })
  const memberNo = String(MEMBER_START + (count || 0)).padStart(3, "0")
  const token = randomBytes(16).toString("hex")

  const row = {
    token,
    name,
    ig,
    email,
    member_no: memberNo,
    city: String(input.city || "medellin").slice(0, 40),
    country: input.country ? String(input.country).slice(0, 60) : null,
    reasons: Array.isArray(input.reasons)
      ? input.reasons.slice(0, 10).map((r) => String(r).slice(0, 60))
      : null,
    trip_dates: input.dates ? String(input.dates).slice(0, 60) : null,
    // new freemium / safety fields
    gender: VALID_GENDERS.includes(input.gender) ? input.gender : null,
    birthday: input.birthday ? String(input.birthday).slice(0, 10) : null,
    interests: Array.isArray(input.interests)
      ? input.interests.slice(0, 10).map((i) => String(i).slice(0, 40))
      : [],
    verified_selfie: !!input.verifiedSelfie,
    allow_dm_from_men: input.allowDmFromMen !== false, // default on
    show_ig_to_men: input.showIgToMen !== false, // default on
  }

  const { error } = await db.from("members").insert(row)
  if (error) throw error
  return { token, memberNo, existing: false }
}

// Admin-gated manual accept (kept for back-compat / inviting people by hand).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const key = req.query?.key
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }

  try {
    const { name, ig, email } = req.body || {}
    if (!name || !ig || !email) {
      return res.status(400).json({ error: "name, ig, email required" })
    }

    const cleanIg = String(ig).trim().slice(0, 80)
    const cleanEmail = String(email).trim().toLowerCase().slice(0, 120)
    const cleanName = String(name).trim().slice(0, 80)

    // idempotent: re-accepting the same instagram returns the existing offer link
    const { data: existing } = await db.from("members").select("*").eq("ig", cleanIg).maybeSingle()
    if (existing) {
      return res.status(200).json({
        ok: true,
        memberNo: existing.member_no,
        url: `https://irlpass.xyz/?screen=offer&t=${existing.token}`,
        note: "already accepted, same link returned",
      })
    }

    // carry over everything the applicant told us
    const app = await findApplication(cleanIg, cleanEmail)
    const { token, memberNo } = await createAcceptedMember({
      name: cleanName,
      ig: cleanIg,
      email: cleanEmail,
      country: app?.country,
      reasons: app?.reasons,
      dates: app?.dates,
      gender: app?.gender,
      birthday: app?.birthday,
      interests: app?.interests,
      verifiedSelfie: app?.verifiedSelfie,
    })

    const url = `https://irlpass.xyz/?screen=offer&t=${token}`
    const mail = await sendEmail({ to: cleanEmail, ...acceptanceEmail({ name: cleanName, memberNo, url }) })

    return res.status(200).json({ ok: true, memberNo, url, emailSent: mail.sent })
  } catch (e) {
    console.error("accept error:", e)
    return res.status(500).json({ error: "could not create acceptance" })
  }
}
