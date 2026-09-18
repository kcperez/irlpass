import { db } from "./_db.js"

// How many members get messaging free while we build density. The first N to
// post dates claim a founding slot; after that the paywall applies.
export const FOUNDING_SLOTS = Number(process.env.FOUNDING_SLOTS || 40)

export const today = () => new Date().toISOString().slice(0, 10)
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))

// two windows overlap when each starts on or before the other ends
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd

// claim a founding slot for this member if any are left. returns the slot number
// (or null). safe to call on every trip post — a member only ever claims once.
export async function claimFoundingSlot(member) {
  if (member.foundingFree) return member.foundingNo || null
  const { count } = await db
    .from("members")
    .select("member_no", { count: "exact", head: true })
    .eq("founding_free", true)
  const taken = count || 0
  if (taken >= FOUNDING_SLOTS) return null
  const { data, error } = await db
    .from("members")
    .update({ founding_free: true, founding_no: taken + 1 })
    .eq("member_no", member.memberNo)
    .select("founding_no")
    .maybeSingle()
  if (error) return null
  return data?.founding_no ?? null
}

export async function foundingLeft() {
  const { count } = await db
    .from("members")
    .select("member_no", { count: "exact", head: true })
    .eq("founding_free", true)
  return Math.max(0, FOUNDING_SLOTS - (count || 0))
}

// Can this member start conversations with people on these dates in this city?
// Free when: they hold a founding slot, they subscribe, or they bought this window.
export async function canReach(member, city, starts, ends) {
  if (member.foundingFree) return { ok: true, via: "founding" }
  if (member.paid) return { ok: true, via: "pass" }
  const { data } = await db
    .from("unlocks")
    .select("city, starts, ends")
    .eq("member_no", member.memberNo)
    .eq("city", city)
  for (const u of data || []) {
    if (overlaps(u.starts, u.ends, starts, ends)) return { ok: true, via: "unlock" }
  }
  return { ok: false, via: null }
}

// the windows this member has already paid for, so the client can stop asking
export async function myUnlocks(memberNo) {
  const { data } = await db
    .from("unlocks")
    .select("city, starts, ends")
    .eq("member_no", memberNo)
    .gte("ends", today())
  return data || []
}

// Can this member start a conversation with that one? Free when they hold a
// founding slot or the pass, when they bought a window covering one of the
// other's trips, or when the other person already wrote to them.
export async function canReachMember(me, otherNo) {
  if (me.foundingFree) return { ok: true, via: "founding" }
  if (me.paid) return { ok: true, via: "pass" }
  const { data: trips } = await db
    .from("trips")
    .select("city, starts, ends")
    .eq("member_no", String(otherNo))
    .gte("ends", today())
  for (const t of trips || []) {
    const r = await canReach(me, t.city, t.starts, t.ends)
    if (r.ok) return r
  }
  return { ok: false, via: null }
}
