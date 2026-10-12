import { getUser, forgetUser } from "./_lib.js"
import { db } from "./_db.js"
import { isMod } from "./_mods.js"

// POST { t, allowDmFromMen?, showIgToMen?, interests?, vibesSeen? } -> update a
// member's safety prefs and vibes. safety powers the women-safety layer: who can
// dm you, who sees your instagram. vibes rank who you see first.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getUser(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const patch = {}
  if (typeof req.body?.allowDmFromMen === "boolean") patch.allow_dm_from_men = req.body.allowDmFromMen
  if (typeof req.body?.showIgToMen === "boolean") patch.show_ig_to_men = req.body.showIgToMen
  // mods only: flip between mod mode and member view (test as a regular member)
  // give to get has an opt-out: keep your photo blurred for people you haven't talked to
  if (typeof req.body?.hidePhoto === "boolean") patch.hide_photo = req.body.hidePhoto
  // leave yourself out of other people's connections
  if (typeof req.body?.hideConnections === "boolean") patch.hide_connections = req.body.hideConnections
  if (typeof req.body?.testAsMember === "boolean" && isMod(me.memberNo)) {
    patch.test_as_member = req.body.testAsMember
  }

  // a real first name, for members whose name was only their handle
  if (typeof req.body?.name === "string") {
    const name = req.body.name.replace(/[^\p{L}\p{M}\s'.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30)
    if (name.length < 2) return res.status(400).json({ error: "type your first name" })
    patch.name = name
  }

  if (Array.isArray(req.body?.interests)) {
    patch.interests = req.body.interests.slice(0, 16).map((i) => String(i).slice(0, 40))
  }

  // the vibes prompt was shown: stamp it once, for the ops funnel. its own write
  // so a missing column (migration 004 not run) never blocks the real save.
  if (req.body?.vibesSeen === true) {
    await db.from("members").update({ vibes_seen_at: new Date().toISOString() }).eq("token", me.token).is("vibes_seen_at", null)
      .then(() => {}, () => {})
    if (!Object.keys(patch).length) return res.status(200).json({ ok: true })
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: "nothing to update" })

  try {
    const { error } = await db.from("members").update(patch).eq("token", me.token)
    forgetUser(me.token)
    if (error) throw error
    return res.status(200).json({ ok: true, ...patch })
  } catch (e) {
    console.error("settings error:", e)
    return res.status(500).json({ error: "could not save settings" })
  }
}
