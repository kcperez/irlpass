import { getMember } from "./_lib.js"
import { db } from "./_db.js"

export default async function handler(req, res) {
  const me = await getMember(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  try {
    const { data, error } = await db
      .from("members")
      .select("name, ig, member_no, country, photo_url")
      .eq("paid", true)
      .eq("banned", false)
      .order("member_no", { ascending: true })
    if (error) throw error
    return res.status(200).json({
      members: data.map((m) => ({
        name: m.name,
        ig: m.ig,
        memberNo: m.member_no,
        country: m.country || "",
        photo: m.photo_url || null,
      })),
    })
  } catch (e) {
    console.error("members error:", e)
    return res.status(500).json({ error: "could not load members" })
  }
}
