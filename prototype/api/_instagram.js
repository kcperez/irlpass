import { put } from "@vercel/blob"
import { db } from "./_db.js"

// Pull the public shape of an instagram profile (photo, name, follower count,
// private or not). This is ENRICHMENT, never proof: anyone can type any handle.
// Proof of ownership is the bio-code check in api/verify.js.

const ACTOR = "apify~instagram-profile-scraper"

export async function fetchIgProfile(handle) {
  const token = process.env.APIFY_TOKEN
  if (!token) return null
  const username = String(handle || "").replace(/^@+/, "").trim().toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(username)) return null

  try {
    const r = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=45`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      }
    )
    if (!r.ok) {
      console.error("apify status", r.status)
      return null
    }
    const items = await r.json()
    const p = Array.isArray(items) ? items[0] : null
    if (!p || p.error) return null
    return {
      username: p.username || username,
      fullName: p.fullName || null,
      photo: p.profilePicUrlHD || p.profilePicUrl || null,
      followers: typeof p.followersCount === "number" ? p.followersCount : null,
      posts: typeof p.postsCount === "number" ? p.postsCount : null,
      private: !!p.private,
      bio: p.biography || "",
      exists: true,
    }
  } catch (e) {
    console.error("apify error:", e.message)
    return null
  }
}

// Fill in a member's profile from their handle, without overwriting anything
// they set themselves. Fire-and-forget: signup never waits on it.
export async function enrichMember(memberNo, handle) {
  const p = await fetchIgProfile(handle)
  if (!p) return null
  const { data: m } = await db
    .from("members")
    .select("photo_url, name, ig_followers")
    .eq("member_no", memberNo)
    .maybeSingle()
  if (!m) return null

  const patch = { ig_followers: p.followers, ig_private: p.private, ig_checked_at: new Date().toISOString() }
  // instagram's cdn links expire, so keep our own copy
  if (!m.photo_url && p.photo) {
    const stored = await storePhoto(p.photo, memberNo)
    if (stored) patch.photo_url = stored
  }
  // a handle stands in as a name until we learn a real one
  if (p.fullName && (!m.name || m.name.replace(/^@/, "") === p.username)) patch.name = p.fullName
  await db.from("members").update(patch).eq("member_no", memberNo)
  return patch
}

// the code someone puts in their bio to prove the account is theirs
export const verifyCode = (memberNo, token) =>
  "irl-" + Buffer.from(`${memberNo}:${String(token).slice(0, 8)}`).toString("base64url").slice(0, 6).toLowerCase()

// copy an instagram avatar into our own blob storage so it doesn't rot
async function storePhoto(url, memberNo) {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 4_000_000) return null
    const blob = await put(`avatars/${memberNo}-${Date.now()}.jpg`, buf, {
      access: "public",
      contentType: r.headers.get("content-type") || "image/jpeg",
      addRandomSuffix: true,
    })
    return blob.url
  } catch (e) {
    console.error("avatar store error:", e.message)
    return null
  }
}
