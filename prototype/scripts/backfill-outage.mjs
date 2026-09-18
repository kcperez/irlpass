// one-off: turn applications saved during the sep 9-17 supabase outage into
// members + send the welcome email. usage: node --env-file=<prod env> scripts/backfill-outage.mjs [--go]
import { list } from "@vercel/blob"
import { readJson } from "../api/_lib.js"
import { db } from "../api/_db.js"
import { createAcceptedMember } from "../api/accept.js"
import { sendEmail, acceptanceEmail } from "../api/_email.js"

const GO = process.argv.includes("--go")
const SINCE = "2026-09-08T00:00:00Z"

let blobs = [], cursor
do { const r = await list({ prefix: "applications/", limit: 1000, cursor }); blobs.push(...r.blobs); cursor = r.cursor } while (cursor)
blobs = blobs.filter((b) => new Date(b.uploadedAt).toISOString() >= SINCE).sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))

const { data: members } = await db.from("members").select("email,ig")
const emails = new Set(members.map((m) => String(m.email).toLowerCase()))
const igs = new Set(members.map((m) => String(m.ig).toLowerCase()))
const norm = (ig) => { const s = String(ig || "").trim().toLowerCase(); return s.startsWith("@") ? s : `@${s}` }

const seen = new Set(), todo = []
for (const b of blobs) {
  const a = await readJson(b.pathname)
  if (!a?.email) continue
  const email = String(a.email).toLowerCase()
  if (seen.has(email)) continue // first application wins (earliest in the queue)
  seen.add(email)
  if (emails.has(email) || igs.has(norm(a.ig))) continue
  todo.push({ ...a, email: email.replace(/\.+$/, "") })
}
console.log(`${blobs.length} applications since ${SINCE}, ${todo.length} unique new people`)

for (const a of todo) {
  if (!GO) { console.log("would add", a.submittedAt, a.email, a.ig, a.city); continue }
  const { token, memberNo, existing } = await createAcceptedMember(a)
  if (existing) { console.log("skip (ig exists)", a.email); continue }
  const url = `https://irlpass.xyz/?screen=app&t=${token}`
  const mail = await sendEmail({ to: String(a.email).toLowerCase(), ...acceptanceEmail({ name: a.name, memberNo, url }) })
  console.log(memberNo, a.email, mail.sent ? "emailed" : `EMAIL FAILED ${mail.reason}`)
  await new Promise((r) => setTimeout(r, 600)) // resend rate limit
}
