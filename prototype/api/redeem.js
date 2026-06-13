import { randomBytes } from "node:crypto"
import { db } from "./_db.js"

const MEMBER_START = 3
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// public: POST { code, name, ig, email, country } -> free comped membership
export default async function handler(req, res) {
  if (req.method === "GET") {
    // validate a code for the redeem screen
    const code = String(req.query?.code || "").toUpperCase()
    const { data } = await db.from("invite_codes").select("*").eq("code", code).maybeSingle()
    const valid = data && data.active && data.used < data.max_uses
    return res.status(200).json({ valid: !!valid, label: data?.label || null })
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  try {
    const code = String(req.body?.code || "").toUpperCase()
    const name = String(req.body?.name || "").trim().slice(0, 80)
    const ig = String(req.body?.ig || "").trim().slice(0, 80)
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 120)
    const country = String(req.body?.country || "").trim().slice(0, 60)

    if (name.length < 2 || ig.length < 3 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "name, instagram and a valid email required" })
    }

    const { data: codeRow } = await db.from("invite_codes").select("*").eq("code", code).maybeSingle()
    if (!codeRow || !codeRow.active || codeRow.used >= codeRow.max_uses) {
      return res.status(403).json({ error: "this code isn't valid anymore" })
    }

    // already a member on this email? just hand them back in
    const { data: existing } = await db.from("members").select("*").eq("email", email).maybeSingle()
    if (existing && !existing.banned) {
      return res.status(200).json({ ok: true, token: existing.token, memberNo: existing.member_no })
    }

    const { count } = await db.from("members").select("*", { count: "exact", head: true })
    const memberNo = String(MEMBER_START + (count || 0)).padStart(3, "0")
    const token = randomBytes(16).toString("hex")

    const { error } = await db.from("members").insert({
      token, name, ig: ig.startsWith("@") ? ig : `@${ig}`, email,
      member_no: memberNo, city: "medellin",
      paid: true, paid_at: new Date().toISOString(), comped: true,
    })
    if (error) throw error

    await db.from("invite_codes").update({ used: codeRow.used + 1 }).eq("code", code)
    return res.status(200).json({ ok: true, token, memberNo })
  } catch (e) {
    console.error("redeem error:", e)
    return res.status(500).json({ error: "could not redeem" })
  }
}
