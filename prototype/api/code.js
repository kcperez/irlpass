import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { today } from "./_access.js"

// POST { t, code } -> a free month (or more) on irlpass. one-time codes josh
// hands out: ride buyers, hosts, partners, promos. each member uses a code once.
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const code = String(req.body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32)
  if (!code) return res.status(400).json({ error: "type your code" })

  try {
    const { data: row } = await db.from("codes").select("*").eq("code", code).maybeSingle()
    if (!row) return res.status(404).json({ error: "that code doesn't exist" })
    if (row.uses >= row.max_uses) return res.status(410).json({ error: "that code has been used" })
    const { error: dupe } = await db.from("code_redemptions").insert({ code, member_no: me.memberNo })
    if (dupe) return res.status(409).json({ error: "you already used this code" })
    // count the use only if nobody beat us to the last one
    const { data: bumped } = await db
      .from("codes")
      .update({ uses: row.uses + 1 })
      .eq("code", code)
      .eq("uses", row.uses)
      .select("code")
    if (!bumped?.length) {
      await db.from("code_redemptions").delete().eq("code", code).eq("member_no", me.memberNo)
      return res.status(409).json({ error: "try that again" })
    }
    const from = me.compUntil && me.compUntil > today() ? me.compUntil : today()
    const until = addDays(from, 30 * Math.max(1, row.months))
    await db.from("members").update({ comp_until: until }).eq("member_no", me.memberNo)
    return res.status(200).json({ ok: true, until, months: row.months })
  } catch (e) {
    console.error("code error:", e)
    return res.status(500).json({ error: "couldn't use that code right now" })
  }
}
