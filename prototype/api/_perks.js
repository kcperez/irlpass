import { db } from "./_db.js"
import { notifyMemberNo } from "./_notify.js"
import { sendEmail } from "./_email.js"

// story slots: every host gets FREE verified stories a month, then prepaid
// packs. a slot is used when staff double tap a pass at the counter.
export const FREE = 20
export const PACKS = { 50: 5000, 200: 15000 } // slots -> cents
export const ASK = { story: "a story", post: "a post", reel: "a reel" }

// a host is a member ("021") or a venue that signed up on its own ("v:paraiso-market")
export const venueSlug = (hostNo) => (String(hostNo || "").startsWith("v:") ? String(hostNo).slice(2) : null)
const creditRow = (hostNo) => {
  const v = venueSlug(hostNo)
  return v ? { table: "venues", key: "slug", id: v } : { table: "members", key: "member_no", id: hostNo }
}

export const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString() }

export async function slots(hostNo) {
  if (!hostNo) return { free: FREE, credits: 0, left: Infinity }
  const [{ count }, { data: m }] = await Promise.all([
    db.from("perk_claims").select("id", { count: "exact", head: true }).eq("host_no", hostNo).eq("status", "given").gte("given_at", monthStart()),
    (({ table, key, id }) => db.from(table).select("perk_credits").eq(key, id).maybeSingle())(creditRow(hostNo)),
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
  return (await addCredits(hostNo, -1)) !== null
}

// optimistic add (or take, with a negative n). null when there isn't enough.
export async function addCredits(hostNo, n) {
  const { table, key, id } = creditRow(hostNo)
  for (let i = 0; i < 5; i++) {
    const { data: m } = await db.from(table).select("perk_credits").eq(key, id).maybeSingle()
    if (!m) return null
    const have = m.perk_credits || 0
    if (have + n < 0) return null
    const { data: done } = await db.from(table).update({ perk_credits: have + n }).eq(key, id).eq("perk_credits", have).select(key)
    if (done?.length) return have + n
  }
  return null
}

// how many of this event's perks are still up for grabs. a venue's always-on
// perk resets every month.
export const standing = (e) => e.source === "venue"
export async function perksLeft(e) {
  let q = db.from("perk_claims").select("id", { count: "exact", head: true }).eq("event_id", e.id)
  if (standing(e)) q = q.gte("created_at", monthStart())
  const { count } = await q
  return Math.max(0, (e.perk?.qty || 0) - (count || 0))
}

export async function tellHostOut(e) {
  if (!e.host_no) return
  const slug = venueSlug(e.host_no)
  if (slug) {
    // once a day at most: the claim page calls this on every view while they're out
    const { data: v } = await db.from("venues").select("name, contact_email, owner_token, out_noticed_at").eq("slug", slug).maybeSingle()
    if (!v?.contact_email || (v.out_noticed_at && Date.now() - Date.parse(v.out_noticed_at) < 864e5)) return
    await db.from("venues").update({ out_noticed_at: new Date().toISOString() }).eq("slug", slug)
    const url = `https://irlpass.xyz/venues/g/${v.owner_token}`
    await sendEmail({
      to: v.contact_email,
      subject: "guests are trying to post for you",
      html: `<p>people are trying to claim ${String(e.perk?.item || "your perk").replace(/</g, "&lt;")} at ${String(v.name).replace(/</g, "&lt;")}, and you're out of story slots for the month.</p><p><a href="${url}">add more stories</a> to keep it going.</p>`,
    }).catch(() => {})
    return
  }
  await notifyMemberNo(e.host_no, {
    subject: "you're out of story slots",
    line: `people are trying to claim ${e.perk?.item || "your perk"} at ${e.title}. add 50 more stories to keep it going.`,
    push: { go: `ev-${e.id}`, tag: `slots-${e.host_no}` },
    email: false,
  }).catch(() => {})
}

export const cleanHandle = (h) => String(h || "").trim().toLowerCase().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "")
export const okHandle = (h) => /^[a-z0-9._]{1,30}$/.test(h)
