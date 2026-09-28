import { db } from "./_db.js"
import { storeLockedThumb } from "./_thumb.js"

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

// copy an instagram avatar into our own storage so it doesn't rot
async function storePhoto(url, memberNo) {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 4_000_000) return null
    const path = `avatars/${memberNo}.jpg`
    const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "content-type": r.headers.get("content-type") || "image/jpeg",
        "x-upsert": "true",
      },
      body: buf,
    })
    if (!up.ok) return null
    await storeLockedThumb(memberNo, buf)
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}?v=${Date.now()}`
  } catch (e) {
    console.error("avatar store error:", e.message)
    return null
  }
}

// Re-check a member's instagram at most once a week, in the background. Their
// own uploaded photo is never replaced — only one we pulled from instagram.
const WEEK = 7 * 864e5

export async function refreshIfStale(member) {
  if (!member?.memberNo || !member.ig) return
  const { data: row } = await db
    .from("members")
    .select("ig_checked_at, photo_url, photo_source")
    .eq("member_no", member.memberNo)
    .maybeSingle()
  if (!row) return
  const last = row.ig_checked_at ? Date.parse(row.ig_checked_at) : 0
  // someone still without a photo gets retried daily; everyone else weekly
  const wait = row.photo_url ? WEEK : 864e5
  if (Date.now() - last < wait) return

  const p = await fetchIgProfile(member.ig)
  // a failed lookup must not count as "checked", or we'd wait a day to retry
  if (!p) return
  const patch = {
    ig_followers: p.followers,
    ig_private: p.private,
    ig_checked_at: new Date().toISOString(),
  }
  // refresh the picture only when it came from instagram in the first place
  if (p.photo && row.photo_source !== "upload") {
    const stored = await storePhoto(p.photo, member.memberNo)
    if (stored) {
      patch.photo_url = stored
      patch.photo_source = "instagram"
    }
  }
  await db.from("members").update(patch).eq("member_no", member.memberNo)
}

// Backfill: every member still without a photo, in one scraper run (far cheaper
// than one run each). Only fills blanks, never replaces a photo someone has.
// refresh: re-pull everyone whose photo came from instagram (or predates us
// tracking the source), in batches of `size`. uploads are never touched.
export async function backfillPhotos({ refresh = false, batch = 0, size = 60 } = {}) {
  const token = process.env.APIFY_TOKEN
  if (!token) return { error: "no scraper key" }
  let query = db
    .from("members")
    .select("member_no, ig, photo_url, photo_source, banned")
    .lt("member_no", "900")
    .order("member_no")
  if (!refresh) query = query.is("photo_url", null)
  const { data: members } = await query
  const todo = (members || [])
    .filter((m) => !m.banned && m.photo_source !== "upload")
    .slice(refresh ? batch * size : 0, refresh ? (batch + 1) * size : undefined)
    .map((m) => ({ no: m.member_no, handle: String(m.ig || "").replace(/^@+/, "").trim().toLowerCase() }))
    .filter((m) => /^[a-z0-9._]{1,30}$/.test(m.handle))
  if (!todo.length) return { missing: 0, filled: 0 }

  const r = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=240`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usernames: todo.map((m) => m.handle) }),
    }
  )
  if (!r.ok) return { error: `scraper ${r.status}`, missing: todo.length, filled: 0 }
  const items = await r.json()
  const byUser = new Map((items || []).filter((p) => p?.username).map((p) => [p.username.toLowerCase(), p]))

  let filled = 0
  const notFound = []
  for (const m of todo) {
    const p = byUser.get(m.handle)
    const src = p && !p.error ? p.profilePicUrlHD || p.profilePicUrl : null
    if (!src) { notFound.push(m.handle); continue }
    const stored = await storePhoto(src, m.no)
    if (!stored) { notFound.push(m.handle); continue }
    let update = db
      .from("members")
      .update({
        photo_url: stored,
        photo_source: "instagram",
        ig_followers: typeof p.followersCount === "number" ? p.followersCount : null,
        ig_private: !!p.private,
        ig_checked_at: new Date().toISOString(),
      })
      .eq("member_no", m.no)
    // a plain backfill only fills blanks; a refresh may replace an old pull
    update = refresh ? update.or("photo_source.is.null,photo_source.neq.upload") : update.is("photo_url", null)
    await update
    filled++
  }
  return { missing: todo.length, filled, notFound }
}

// members whose "name" is really their handle get the name on their instagram
// profile. only fills a real-looking name; never touches one they typed.
export async function backfillNames() {
  const token = process.env.APIFY_TOKEN
  if (!token) return { error: "no scraper key" }
  const { data: members } = await db.from("members").select("member_no, name, ig, banned").lt("member_no", "900")
  const looksLikeHandle = (m) => {
    const n = String(m.name || "").trim()
    const h = String(m.ig || "").replace(/^@+/, "").toLowerCase()
    const first = n.split(/\s+/)[0] || ""
    return !first || n.toLowerCase() === h || first.toLowerCase() === h || /[_.\d]/.test(first)
  }
  const todo = (members || [])
    .filter((m) => !m.banned && looksLikeHandle(m))
    .map((m) => ({ no: m.member_no, handle: String(m.ig || "").replace(/^@+/, "").trim().toLowerCase() }))
    .filter((m) => /^[a-z0-9._]{1,30}$/.test(m.handle))
  if (!todo.length) return { missing: 0, named: 0 }

  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=240`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: todo.map((m) => m.handle) }),
  })
  if (!r.ok) return { error: `scraper ${r.status}` }
  const byUser = new Map(((await r.json()) || []).filter((p) => p?.username).map((p) => [p.username.toLowerCase(), p]))

  let named = 0
  const none = []
  for (const m of todo) {
    // "Juan Pérez 🇨🇴 | DJ" -> "Juan Pérez": drop emoji, bars and job titles
    const full = String(byUser.get(m.handle)?.fullName || "")
      .split(/[|•·]|\s-\s/)[0]
      .replace(/[^\p{L}\p{M}\s'.-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40)
    const ok = full && /\p{L}{2,}/u.test(full) && full.toLowerCase() !== m.handle
    if (!ok) { none.push(m.handle); continue }
    await db.from("members").update({ name: full }).eq("member_no", m.no)
    named++
  }
  return { missing: todo.length, named, none }
}
