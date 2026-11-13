import { db } from "./_db.js"
import { notifyMemberNo } from "./_notify.js"

// story slots: every host gets FREE verified stories a month, then prepaid
// packs. a slot is used when staff double tap a pass at the counter.
export const FREE = 20
export const PACKS = { 50: 5000, 200: 15000 } // slots -> cents
export const ASK = { story: "a story", post: "a post", reel: "a reel" }

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString() }

export async function slots(hostNo) {
  if (!hostNo) return { free: FREE, credits: 0, left: Infinity }
  const [{ count }, { data: m }] = await Promise.all([
    db.from("perk_claims").select("id", { count: "exact", head: true }).eq("host_no", hostNo).eq("status", "given").gte("given_at", monthStart()),
    db.from("members").select("perk_credits").eq("member_no", hostNo).maybeSingle(),
  ])
  const free = Math.max(0, FREE - (count || 0))
  const credits = m?.perk_credits || 0
  return { free, credits, left: free + credits }
}

// take one slot for a redemption. false when the host is out.
export async function useSlot(hostNo) {
  if (!hostNo) return true
  const s = await slots(hostNo)
  if (s.free > 0) return true
  for (let i = 0; i < 3; i++) {
    const { data: m } = await db.from("members").select("perk_credits").eq("member_no", hostNo).maybeSingle()
    const have = m?.perk_credits || 0
    if (have <= 0) return false
    const { data: done } = await db.from("members").update({ perk_credits: have - 1 }).eq("member_no", hostNo).eq("perk_credits", have).select("member_no")
    if (done?.length) return true
  }
  return false
}

// how many of this event's perks are still up for grabs
export async function perksLeft(e) {
  const { count } = await db.from("perk_claims").select("id", { count: "exact", head: true }).eq("event_id", e.id)
  return Math.max(0, (e.perk?.qty || 0) - (count || 0))
}

export async function tellHostOut(e) {
  if (!e.host_no) return
  await notifyMemberNo(e.host_no, {
    subject: "you're out of story slots",
    line: `people are trying to claim ${e.perk?.item || "your perk"} at ${e.title}. add 50 more stories to keep it going.`,
    push: { go: `ev-${e.id}`, tag: `slots-${e.host_no}` },
    email: false,
  }).catch(() => {})
}

export const cleanHandle = (h) => String(h || "").trim().toLowerCase().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "")
export const okHandle = (h) => /^[a-z0-9._]{1,30}$/.test(h)
