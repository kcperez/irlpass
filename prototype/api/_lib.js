import { get } from "@vercel/blob"
import { db } from "./_db.js"
import { isMod } from "./_mods.js"

export const TOKEN_RE = /^[a-f0-9]{32}$/

export async function readJson(pathname) {
  try {
    const g = await get(pathname, { access: "private" })
    if (!g) return null
    return JSON.parse(await new Response(g.stream).text())
  } catch {
    return null
  }
}

export const rowToMember = (r) =>
  r && {
    token: r.token,
    name: r.name,
    ig: r.ig,
    email: r.email,
    country: r.country,
    memberNo: r.member_no,
    city: r.city,
    paid: r.paid,
    banned: r.banned,
    stripeCustomer: r.stripe_customer,
    photo: r.photo_url || null,
    canHost: !!r.can_host,
    // freemium + reputation + safety (columns added by migration; undefined until then)
    gender: r.gender || null,
    birthday: r.birthday || null,
    verified: !!r.ig_verified || !!r.verified_selfie,
    igFollowers: typeof r.ig_followers === "number" ? r.ig_followers : null,
    igPrivate: r.ig_private === true,
    repScore: typeof r.rep_score === "number" ? r.rep_score : null,
    repCount: typeof r.rep_count === "number" ? r.rep_count : 0,
    interests: Array.isArray(r.interests) ? r.interests : [],
    allowDmFromMen: r.allow_dm_from_men !== false, // default on
    showIgToMen: r.show_ig_to_men !== false, // default on
    // v2: founding slot = messaging is free for this member, forever
    foundingFree: !!r.founding_free,
    foundingNo: r.founding_no || null,
    testAsMember: r.test_as_member === true,
  }

// look up an accepted person by token (paid or not)
export async function getAccepted(token) {
  if (!token || !TOKEN_RE.test(token)) return null
  const { data } = await db.from("members").select("*").eq("token", token).single()
  return rowToMember(data)
}

// a USER = accepted + not banned. paid is optional. this is the free tier — use
// this everywhere a non-paying member should still get in (the app is free locally).
export async function getUser(token) {
  const m = await getAccepted(token)
  if (!m || m.banned) return null
  // member view: a mod testing as a regular free member loses the pass, the
  // founding slot and mod powers (see actsAsMod) until they flip back
  if (m.testAsMember && isMod(m.memberNo)) {
    return { ...m, modOff: true, paid: false, foundingFree: false, comped: false }
  }
  return m
}

// a PAID member = user + active subscription. only the premium gates use this
// (cross-city joins, DMs to strangers, full lists, billing portal).
export async function getPaid(token) {
  const m = await getUser(token)
  if (!m || !m.paid) return null
  return m
}

// back-compat alias — getMember historically meant "paid". keep for endpoints
// that are still strictly paid-only (portal, seat checkout/activate).
export const getMember = getPaid

// a locked person's face: a 36x45 thumbnail the app softly blurs. enough to get
// a read on who's there (guy, girl, their vibe), not enough to recognize them,
// and the full photo never reaches someone who hasn't unlocked. stored photos only.
export const lockedPhoto = (url) => {
  const u = String(url || "")
  if (!u.includes("/storage/v1/object/public/")) return null
  return `${u.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/").split("?")[0]}?width=36&height=45&resize=cover&quality=50`
}

// the first name a locked viewer sees. many members' "name" is just their
// instagram handle, and showing that would give the account away before
// they've unlocked, so a handle-looking name becomes an initial ("L.")
export const safeFirstName = (name, ig) => {
  const n = String(name || "").trim()
  const first = n.split(/\s+/)[0] || ""
  const handle = String(ig || "").replace(/^@+/, "").toLowerCase()
  const looksLikeHandle = !first || first.toLowerCase() === handle || /[_.\d]/.test(first) || n.toLowerCase() === handle
  if (looksLikeHandle) return first ? `${first[0].toUpperCase()}.` : "someone"
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}
