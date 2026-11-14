import crypto from "node:crypto"
import { db } from "./_db.js"
import { useSlot } from "./_perks.js"

// instagram → irlpass. every perk story tags @irlpass.xyz, so instagram tells
// our own account each time someone mentions it in a story. we note who
// (igm:<handle>) and give any open perk claim from that handle on its own:
// no staff, no counter, works the same for a webinar or a bar.
// env: IG_APP_SECRET (signs posts), IG_VERIFY_TOKEN (subscribe handshake),
// IG_TOKEN (long-lived instagram login token for @irlpass.xyz, reads usernames)
export const config = { api: { bodyParser: false } }
const DAY = 864e5
const G = "https://graph.instagram.com/v23.0"

const raw = (req) => new Promise((ok, no) => { const b = []; req.on("data", (c) => b.push(c)); req.on("end", () => ok(Buffer.concat(b))); req.on("error", no) })
const clean = (h) => String(h || "").toLowerCase().replace(/^@+/, "").trim()

// a mention just landed (or a claim just came in): give every open claim from
// this handle in the last day. returns how many were given.
export async function giveFromMention(handle) {
  const h = clean(handle)
  if (!h) return 0
  const since = new Date(Date.now() - DAY).toISOString()
  const { data: open } = await db.from("perk_claims").select("id, host_no").eq("handle", h).eq("status", "claimed").gte("created_at", since)
  let n = 0
  for (const c of open || []) {
    if (!(await useSlot(c.host_no))) continue
    const { data } = await db.from("perk_claims").update({ status: "given", given_at: new Date().toISOString() }).eq("id", c.id).eq("status", "claimed").select("id")
    if (data?.length) n++
  }
  return n
}

// did this handle tag @irlpass.xyz in a story in the last day?
export async function mentionedRecently(handle) {
  const h = clean(handle)
  if (!h) return false
  const { data } = await db.from("app_settings").select("value").eq("key", `igm:${h}`).maybeSingle()
  return !!data && Date.now() - Number(data.value) < DAY
}

async function usernameOf(igsid) {
  if (!process.env.IG_TOKEN) return null
  const r = await fetch(`${G}/${encodeURIComponent(igsid)}?fields=username&access_token=${process.env.IG_TOKEN}`).then((x) => x.json()).catch(() => null)
  return r?.username || null
}

export default async function handler(req, res) {
  // meta's subscribe handshake
  if (req.method === "GET") {
    const q = req.query || {}
    if (q["hub.mode"] === "subscribe" && process.env.IG_VERIFY_TOKEN && q["hub.verify_token"] === process.env.IG_VERIFY_TOKEN) return res.status(200).send(String(q["hub.challenge"] || ""))
    return res.status(403).send("no")
  }
  if (req.method !== "POST") return res.status(405).end()
  const body = await raw(req)
  const sig = String(req.headers["x-hub-signature-256"] || "")
  const want = process.env.IG_APP_SECRET ? "sha256=" + crypto.createHmac("sha256", process.env.IG_APP_SECRET).update(body).digest("hex") : ""
  if (!want || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.status(401).end()

  let evt = null
  try { evt = JSON.parse(body.toString("utf8")) } catch { return res.status(400).end() }
  const mentions = []
  for (const entry of evt?.entry || []) {
    for (const m of entry.messaging || []) {
      const atts = m.message?.attachments || []
      if (atts.some((a) => a.type === "story_mention") && m.sender?.id && m.sender.id !== entry.id) mentions.push(m.sender.id)
    }
  }
  for (const igsid of [...new Set(mentions)]) {
    const handle = clean(await usernameOf(igsid))
    if (!handle) continue
    await db.from("app_settings").upsert({ key: `igm:${handle}`, value: String(Date.now()) }).then(() => {}, () => {})
    await giveFromMention(handle).catch(() => 0)
  }
  return res.status(200).json({ ok: true })
}
