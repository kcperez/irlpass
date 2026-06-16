import { get } from "@vercel/blob"
import { db } from "./_db.js"

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
  }

// look up an accepted person by token (paid or not)
export async function getAccepted(token) {
  if (!token || !TOKEN_RE.test(token)) return null
  const { data } = await db.from("members").select("*").eq("token", token).single()
  return rowToMember(data)
}

// a member = accepted + paid + not banned
export async function getMember(token) {
  const m = await getAccepted(token)
  if (!m || !m.paid || m.banned) return null
  return m
}
