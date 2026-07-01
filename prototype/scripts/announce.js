// Win-back / activation broadcast for the freemium relaunch.
//
// SAFE BY DEFAULT. Running with no flags does a DRY RUN — it computes the three
// audience segments and prints who would get what, and sends NOTHING.
//
//   node --env-file=.env.local scripts/announce.js                 # dry run (default)
//   node --env-file=.env.local scripts/announce.js --test=you@x.com# send all 3 samples to you only
//   node --env-file=.env.local scripts/announce.js --send          # REAL send to everyone
//   node --env-file=.env.local scripts/announce.js --send --segment=founders
//
// --send requires RESEND_API_KEY in the env. Real sends are throttled.
import { list } from "@vercel/blob"
import { readJson } from "../api/_lib.js"
import { db } from "../api/_db.js"
import { createAcceptedMember } from "../api/accept.js"
import { sendEmail } from "../api/_email.js"

const ARGV = process.argv.slice(2)
const flag = (name) => ARGV.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
const flagVal = (name) => { const f = flag(name); return f && f.includes("=") ? f.split("=")[1] : null }
const DRY = !flag("send") && !flag("test")
const TEST_TO = flagVal("test")
const ONLY = flagVal("segment") // pending | dormant | founders | null
const SITE = "https://irlpass.xyz"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const firstName = (n) => String(n || "there").trim().split(/\s+/)[0].toLowerCase()
const link = (token) => `${SITE}/?screen=app&t=${token}`

// ── email bodies (inner html — sendEmail wraps them in the branded shell) ──
const btn = (url, label) =>
  `<a href="${url}" style="display:inline-block;margin:20px 0 8px;background:#cdee45;color:#1c1b17;font:600 15px Geist,Helvetica,Arial,sans-serif;text-decoration:none;padding:13px 26px;border-radius:999px">${label}</a>`
const unsub =
  `<p style="margin-top:22px;color:#8a857a;font:400 11px Geist,Helvetica,Arial,sans-serif">not for you? <a href="mailto:hello@irlpass.xyz?subject=unsubscribe" style="color:#8a857a">unsubscribe here</a>.</p>`
const P = (s) => `<p style="margin:0 0 12px;color:#1c1b17;font:400 15px/1.6 Geist,Helvetica,Arial,sans-serif">${s}</p>`

const emailPending = (name, token) => ({
  subject: "you're in. no more waiting.",
  html:
    P(`hey ${firstName(name)} —`) +
    P("you applied to irlpass a while back, and we made you wait. that's on us.") +
    P("so here's the news: we took the whole gate down. no vetting queue, no paywall to get in. medellín's club is live, and it's free.") +
    P("you're in. your spot's ready:") +
    btn(link(token), "open the club →") +
    P("inside: see who's around, jump into plans — dinners, day trips, rooftops — with a group chat for each. all free in your city. the map's open to every city too, so wherever you land next, there's already people.") +
    P("land somewhere knowing nobody. leave knowing everybody.") +
    P("— irlpass") +
    unsub,
})

const emailDormant = (name, token) => ({
  subject: "the wall came down",
  html:
    P(`hey ${firstName(name)} —`) +
    P("when you joined, irlpass sat behind a paywall. it doesn't anymore.") +
    P("the whole club is free now — see what's happening in medellín, make plans, chat with the people going. and we opened the map to every city, so wherever you travel next, there's people already there.") +
    P("your door's still open:") +
    btn(link(token), "back into the club →") +
    P("come see what's new 🤝") +
    P("— irlpass") +
    unsub,
})

const emailFounder = (name, token) => ({
  subject: "your founding pass is permanent",
  html:
    P(`hey ${firstName(name)} —`) +
    P("quick one: you were one of the first into irlpass, so your founding membership is permanent. nothing changes for you.") +
    P("what's new — we made the club free for everyone to join (that's how we grow), and opened the map globally: every city, one club. plans, group chats, women-only plans 🌸, dms, reputation — all live now.") +
    P("you helped start this. here's where it's going:") +
    btn(link(token), "open the club →") +
    P("— kevin") +
    unsub,
})

// ── build the three segments ──
async function buildSegments() {
  const { blobs } = await list({ prefix: "applications/", limit: 1000 })
  const appByEmail = new Map()
  for (const b of blobs) {
    const a = await readJson(b.pathname)
    if (a && a.email) appByEmail.set(String(a.email).toLowerCase(), a)
  }
  const { data: members } = await db.from("members").select("member_no, name, email, token, comped, paid")
  const memberEmails = new Set((members || []).map((m) => String(m.email || "").toLowerCase()))

  const real = (members || []).filter((m) => Number(m.member_no) < 900) // drop test accounts
  const founders = real.filter((m) => m.comped)
  const dormant = real.filter((m) => !m.comped)
  const pending = [...appByEmail.values()].filter((a) => !memberEmails.has(String(a.email).toLowerCase()))
  return { founders, dormant, pending }
}

async function main() {
  const { founders, dormant, pending } = await buildSegments()
  console.log(`segments — pending: ${pending.length} · dormant: ${dormant.length} · founders: ${founders.length}`)

  if (DRY) {
    console.log("\nDRY RUN — nothing will be sent. sample recipients per segment:")
    console.log("  pending :", pending.slice(0, 5).map((a) => a.name).join(", "))
    console.log("  dormant :", dormant.slice(0, 5).map((m) => m.name).join(", "))
    console.log("  founders:", founders.slice(0, 5).map((m) => m.name).join(", "))
    console.log("\nnext: --test=you@email.com to preview, then --send to go live.")
    return
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing — cannot send. add it to .env.local.")
    process.exit(1)
  }

  if (TEST_TO) {
    console.log(`TEST — sending all 3 samples to ${TEST_TO} only`)
    const demoToken = "TESTTOKENxxxxxxxxxxxxxxxxxxxxxxxx"
    for (const e of [emailPending("Alex", demoToken), emailDormant("Alex", demoToken), emailFounder("Alex", demoToken)]) {
      const r = await sendEmail({ to: TEST_TO, ...e })
      console.log("  ", e.subject, "→", r.sent ? "sent" : `FAILED (${r.reason || "?"})`)
      await sleep(600)
    }
    return
  }

  // ── real send ──
  const run = (name) => !ONLY || ONLY === name
  let sent = 0, failed = 0

  if (run("founders")) for (const m of founders) {
    const r = await sendEmail({ to: m.email, ...emailFounder(m.name, m.token) })
    r.sent ? sent++ : failed++
    console.log(`  founder ${m.name} → ${r.sent ? "sent" : "FAIL"}`)
    await sleep(600)
  }

  if (run("dormant")) for (const m of dormant) {
    const r = await sendEmail({ to: m.email, ...emailDormant(m.name, m.token) })
    r.sent ? sent++ : failed++
    console.log(`  dormant ${m.name} → ${r.sent ? "sent" : "FAIL"}`)
    await sleep(600)
  }

  if (run("pending")) for (const a of pending) {
    // auto-accept: mint them a real member + token, then send their magic link
    try {
      const { token } = await createAcceptedMember({
        name: a.name, ig: a.ig, email: a.email, country: a.country,
        reasons: a.reasons, dates: a.dates, city: a.city || "medellin",
      })
      const r = await sendEmail({ to: a.email, ...emailPending(a.name, token) })
      r.sent ? sent++ : failed++
      console.log(`  accepted+emailed ${a.name} → ${r.sent ? "sent" : "FAIL"}`)
    } catch (e) {
      failed++
      console.error(`  FAIL ${a.name}: ${e.message}`)
    }
    await sleep(700)
  }

  console.log(`\ndone — sent ${sent}, failed ${failed}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
