import { getUser } from "./_lib.js"
import { db } from "./_db.js"

export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  // free users (paid=false) are part of the community now. only the *full* list
  // is gated — free viewers get a truncated slice (client decides), so we still
  // return everyone non-banned here and flag who's paid for badges/reputation.
  try {
    const { data, error } = await db
      .from("members")
      .select("name, ig, member_no, country, photo_url, paid, verified_selfie, rep_score, rep_count")
      .eq("banned", false)
      .order("member_no", { ascending: true })
    if (error) throw error
    return res.status(200).json({
      viewerPaid: !!me.paid,
      members: data.map((m) => ({
        name: m.name,
        ig: m.ig,
        memberNo: m.member_no,
        country: m.country || "",
        photo: m.photo_url || null,
        verified: !!m.verified_selfie,
        repScore: typeof m.rep_score === "number" ? m.rep_score : null,
        repCount: typeof m.rep_count === "number" ? m.rep_count : 0,
      })),
    })
  } catch (e) {
    console.error("members error:", e)
    return res.status(500).json({ error: "could not load members" })
  }
}
