import { getMember } from "./_lib.js"
import { db } from "./_db.js"

export const config = { api: { bodyParser: { sizeLimit: "3mb" } } }

// POST { t, image: "data:image/jpeg;base64,..." } -> uploads avatar, saves url
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const me = await getMember(req.body?.t)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    const image = String(req.body?.image || "")
    const match = image.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
    if (!match) return res.status(400).json({ error: "bad image" })
    const buf = Buffer.from(match[2], "base64")
    if (buf.length > 1_800_000) return res.status(400).json({ error: "too large" })

    const path = `avatars/${me.memberNo}.jpg`
    const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "content-type": `image/${match[1]}`,
        "x-upsert": "true",
      },
      body: buf,
    })
    if (!up.ok) throw new Error("upload failed: " + (await up.text()).slice(0, 120))

    // cache-bust so the new photo shows immediately everywhere
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}?v=${Date.now()}`
    const { error } = await db.from("members").update({ photo_url: url }).eq("token", me.token)
    if (error) throw error
    return res.status(200).json({ ok: true, photo: url })
  } catch (e) {
    console.error("profile error:", e)
    return res.status(500).json({ error: "could not save photo" })
  }
}
