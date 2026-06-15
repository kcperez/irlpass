import { getMember } from "./_lib.js"
import { db } from "./_db.js"

export const config = { api: { bodyParser: { sizeLimit: "3mb" } } }

// POST { t, id, image } -> creator uploads a cover photo for their activity
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getMember(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  const id = String(req.body?.id || "")
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: "bad id" })

  try {
    const { data: act } = await db.from("activities").select("creator").eq("id", id).maybeSingle()
    if (!act) return res.status(404).json({ error: "not found" })
    if (act.creator.memberNo !== me.memberNo) return res.status(403).json({ error: "only the creator" })

    const image = String(req.body?.image || "")
    const m = image.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
    if (!m) return res.status(400).json({ error: "bad image" })
    const buf = Buffer.from(m[2], "base64")
    if (buf.length > 1_800_000) return res.status(400).json({ error: "too large" })

    const path = `avatars/activity-${id}.jpg`
    const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "content-type": `image/${m[1]}`,
        "x-upsert": "true",
      },
      body: buf,
    })
    if (!up.ok) throw new Error("upload failed")
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}?v=${Date.now()}`
    const { error } = await db.from("activities").update({ image_url: url }).eq("id", id)
    if (error) throw error
    return res.status(200).json({ ok: true, image: url })
  } catch (e) {
    console.error("activity-photo error:", e)
    return res.status(500).json({ error: "could not save photo" })
  }
}
