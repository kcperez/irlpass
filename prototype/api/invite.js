import { db } from "./_db.js"

// public teaser for an activity invite. exposes only what a flyer would.
export default async function handler(req, res) {
  const id = String(req.query?.a || "")
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: "bad invite" })
  try {
    const { data } = await db
      .from("activities")
      .select("title, when_text, place_name, creator, joined, spots")
      .eq("id", id)
      .single()
    if (!data) return res.status(404).json({ error: "not found" })
    res.setHeader("cache-control", "s-maxage=60")
    return res.status(200).json({
      title: data.title,
      when: data.when_text,
      place: data.place_name,
      host: String(data.creator?.name || "a member").split(" ")[0],
      going: data.joined.length,
      spotsLeft: data.spots >= 999 ? null : Math.max(0, data.spots - data.joined.length),
    })
  } catch (e) {
    return res.status(404).json({ error: "not found" })
  }
}
