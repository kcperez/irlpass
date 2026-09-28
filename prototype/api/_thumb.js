import sharp from "sharp"

// the preview a locked viewer sees: a tiny, already-blurred copy of a member's
// photo, made once when the photo is saved and served as a plain file. (the
// supabase image transformer did this per request and ran past the plan's
// monthly quota in two days.)
export const lockPath = (memberNo) => `avatars/lock/${memberNo}.jpg`

export async function storeLockedThumb(memberNo, buffer) {
  try {
    const small = await sharp(buffer).rotate().resize(36, 45, { fit: "cover" }).blur(1.2).jpeg({ quality: 55 }).toBuffer()
    const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${lockPath(memberNo)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "content-type": "image/jpeg",
        "x-upsert": "true",
      },
      body: small,
    })
    return r.ok
  } catch (e) {
    console.error("locked thumb error:", e.message)
    return false
  }
}
