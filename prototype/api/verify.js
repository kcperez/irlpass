import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { fetchIgProfile, verifyCode, enrichMember } from "./_instagram.js"

// Proof that the handle is theirs: we give them a code, they put it in their
// instagram bio for a minute, we read the bio back. Works on any account type,
// unlike instagram login, which only covers professional accounts.

// GET  ?t=      -> their code and current state
// POST { t }    -> check the bio now
export default async function handler(req, res) {
  const token = req.method === "POST" ? req.body?.t : req.query?.t
  const me = await getUser(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  const code = verifyCode(me.memberNo, token)

  if (req.method === "GET") {
    return res.status(200).json({ code, verified: me.verified, ig: me.ig })
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })

  try {
    const p = await fetchIgProfile(me.ig)
    if (!p) return res.status(502).json({ error: "instagram didn't answer. try again in a minute" })

    const bio = String(p.bio || "").toLowerCase()
    if (!bio.includes(code)) {
      return res.status(200).json({
        ok: false,
        code,
        private: p.private,
        error: "we couldn't find the code in your bio yet. paste it, save, then tap again",
      })
    }

    await db
      .from("members")
      .update({ ig_verified: true, ig_verified_at: new Date().toISOString(), verified_selfie: true })
      .eq("member_no", me.memberNo)
    // now that we know it's theirs, fill in the photo and follower count
    enrichMember(me.memberNo, me.ig).catch(() => {})

    return res.status(200).json({ ok: true, verified: true })
  } catch (e) {
    console.error("verify error:", e)
    return res.status(500).json({ error: "could not check right now" })
  }
}
