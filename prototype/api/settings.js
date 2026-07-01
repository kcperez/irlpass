import { getUser } from "./_lib.js"
import { db } from "./_db.js"

// POST { t, allowDmFromMen?, showIgToMen? } -> update a member's safety prefs.
// these power the women-safety layer: who can dm you, who sees your instagram.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const patch = {}
  if (typeof req.body?.allowDmFromMen === "boolean") patch.allow_dm_from_men = req.body.allowDmFromMen
  if (typeof req.body?.showIgToMen === "boolean") patch.show_ig_to_men = req.body.showIgToMen
  if (!Object.keys(patch).length) return res.status(400).json({ error: "nothing to update" })

  try {
    const { error } = await db.from("members").update(patch).eq("token", me.token)
    if (error) throw error
    return res.status(200).json({ ok: true, ...patch })
  } catch (e) {
    console.error("settings error:", e)
    return res.status(500).json({ error: "could not save settings" })
  }
}
