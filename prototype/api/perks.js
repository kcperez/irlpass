import Anthropic from "@anthropic-ai/sdk"
import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { isMod } from "./_mods.js"
import { notifyMemberNo } from "./_notify.js"

export const config = { api: { bodyParser: { sizeLimit: "4mb" } }, maxDuration: 30 }

// self-serve storytime: a host's event carries a perk ("1 story = 1 free
// smoothie, 50 of them"). guests who are going submit a screenshot of their
// post. claude checks it for the tag and approves on the spot; anything unsure
// waits for the host. approved guests show a live pass at the counter.
// GET  ?t&id                                 -> { perk, left, mine, claims? (host only) }
// POST { t, action: "submit", id, image }    -> submit a screenshot
// POST { t, action: "decide", claim, ok }    -> host approves or rejects
// POST { t, action: "given", claim }         -> staff tapped "given" on the guest's phone
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "someone"
const ASK = { story: "an instagram story", post: "an instagram or tiktok post", reel: "a reel or tiktok video" }

async function left(e) {
  const { count } = await db.from("perk_claims").select("id", { count: "exact", head: true }).eq("event_id", e.id).in("status", ["approved", "given"])
  return Math.max(0, (e.perk?.qty || 0) - (count || 0))
}
const isHost = (e, me) => e.host_no === me.memberNo || isMod(me.memberNo)

async function upload(image, key) {
  const m = String(image || "").match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
  if (!m) return null
  const buf = Buffer.from(m[2], "base64")
  if (buf.length > 3_000_000) return null
  const path = `avatars/perk-${key}.jpg`
  const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, "content-type": `image/${m[1]}`, "x-upsert": "true" },
    body: buf,
  })
  return up.ok ? { url: `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}?v=${Date.now()}`, type: `image/${m[1]}`, data: m[2] } : null
}

// does the screenshot show the post the host asked for, with the tag?
async function check(img, e, me) {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: null, note: "waiting for the host" }
  try {
    const msg = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 400,
      output_config: { effort: "low" },
      system: `you check screenshots people submit to claim a perk at an event. the host asked for ${ASK[e.perk.ask] || ASK.story} that tags ${(e.perk.tags || []).join(" and ") || "the venue"}. approve only if the screenshot clearly shows a real social post or story with every required tag visible (as an @mention, sticker or tag). the poster's own handle is ${me.ig || "unknown"}. answer with only json: {"ok": true|false|null, "note": "one short lowercase reason"}. use null when you can't tell.`,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: img.type, data: img.data } }, { type: "text", text: "does this qualify?" }] }],
    })
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("")
    const out = JSON.parse((text.match(/\{[\s\S]*\}/) || ["{}"])[0])
    return { ok: typeof out.ok === "boolean" ? out.ok : null, note: String(out.note || "").slice(0, 200) }
  } catch (err) {
    console.error("perk check failed:", err?.status, err?.message)
    return { ok: null, note: "waiting for the host" }
  }
}

export default async function handler(req, res) {
  const me = await getUser(req.method === "GET" ? req.query?.t : req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  try {
    if (req.method === "GET") {
      const id = Number(req.query?.id)
      const { data: e } = await db.from("events").select("id, perk, host_no, title").eq("id", id).maybeSingle()
      if (!e?.perk) return res.status(404).json({ error: "no perk on this one" })
      const { data: mine } = await db.from("perk_claims").select("id, status, note, created_at, given_at").eq("event_id", id).eq("member_no", me.memberNo).maybeSingle()
      let claims
      if (isHost(e, me)) {
        const { data: rows } = await db.from("perk_claims").select("*").eq("event_id", id).order("created_at", { ascending: false }).limit(200)
        const nos = [...new Set((rows || []).map((r) => r.member_no))]
        const { data: ms } = nos.length ? await db.from("members").select("member_no, name, ig, ig_followers").in("member_no", nos) : { data: [] }
        const by = new Map((ms || []).map((m) => [m.member_no, m]))
        claims = (rows || []).map((r) => ({ id: r.id, status: r.status, note: r.note, image: r.image_url, name: first(by.get(r.member_no)?.name), ig: by.get(r.member_no)?.ig || null, followers: by.get(r.member_no)?.ig_followers || null, at: r.created_at }))
      }
      return res.status(200).json({ perk: e.perk, left: await left(e), mine: mine || null, claims })
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const action = req.body?.action

    if (action === "submit") {
      const id = Number(req.body?.id)
      const { data: e } = await db.from("events").select("id, perk, host_no, title").eq("id", id).eq("hidden", false).maybeSingle()
      if (!e?.perk) return res.status(404).json({ error: "no perk on this one" })
      const { data: going } = await db.from("event_going").select("event_id").eq("event_id", id).eq("member_no", me.memberNo).maybeSingle()
      if (!going) return res.status(403).json({ error: "tap i'm going first" })
      const { data: had } = await db.from("perk_claims").select("id, status").eq("event_id", id).eq("member_no", me.memberNo).maybeSingle()
      if (had && had.status !== "rejected") return res.status(409).json({ error: "you already sent one" })
      if ((await left(e)) <= 0) return res.status(409).json({ error: "they're all gone" })
      const img = await upload(req.body?.image, `${id}-${me.memberNo}`)
      if (!img) return res.status(400).json({ error: "that screenshot didn't upload. try again." })
      const verdict = await check(img, e, me)
      const status = verdict.ok === true ? "approved" : verdict.ok === false ? "rejected" : "pending"
      const row = { event_id: id, member_no: me.memberNo, image_url: img.url, status, note: verdict.note || null, decided_at: status === "pending" ? null : new Date().toISOString(), created_at: new Date().toISOString() }
      const { error } = await db.from("perk_claims").upsert(row, { onConflict: "event_id,member_no" })
      if (error) throw error
      if (status === "pending" && e.host_no) await notifyMemberNo(e.host_no, { subject: e.title, line: `${first(me.name)} sent a post for the perk. tap to check it.`, push: { go: `ev-${id}`, tag: `perk-${id}` }, email: false })
      return res.status(200).json({ status, note: verdict.note })
    }

    const claimId = Number(req.body?.claim)
    const { data: c } = claimId ? await db.from("perk_claims").select("*").eq("id", claimId).maybeSingle() : { data: null }
    if (!c) return res.status(404).json({ error: "that claim is gone" })
    const { data: e } = await db.from("events").select("id, perk, host_no, title").eq("id", c.event_id).maybeSingle()

    if (action === "decide") {
      if (!isHost(e, me)) return res.status(403).json({ error: "only the host" })
      if (req.body?.ok && c.status !== "approved" && c.status !== "given" && (await left(e)) <= 0) return res.status(409).json({ error: "none left" })
      const status = req.body?.ok ? "approved" : "rejected"
      await db.from("perk_claims").update({ status, decided_at: new Date().toISOString(), note: req.body?.ok ? "approved by the host" : "the host passed on this one" }).eq("id", claimId)
      await notifyMemberNo(c.member_no, { subject: e.title, line: req.body?.ok ? `your ${e.perk?.item || "perk"} is ready. show your pass at the counter.` : "the host passed on your post. you can send another.", push: { go: `ev-${e.id}`, tag: `perk-${e.id}` }, email: false })
      return res.status(200).json({ ok: true, status })
    }
    if (action === "given") {
      if (c.member_no !== me.memberNo && !isHost(e, me)) return res.status(403).json({ error: "not yours" })
      if (c.status !== "approved") return res.status(409).json({ error: c.status === "given" ? "already given" : "not approved yet" })
      await db.from("perk_claims").update({ status: "given", given_at: new Date().toISOString() }).eq("id", claimId)
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: "unknown action" })
  } catch (err) {
    console.error("perks error:", err)
    return res.status(500).json({ error: "something broke. try again." })
  }
}
