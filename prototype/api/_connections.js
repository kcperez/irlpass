import { db } from "./_db.js"
import { overlaps } from "./_access.js"

// connections, the way airbnb does "people you've traveled with": everyone you
// actually crossed paths with on irlpass. a connection is someone you've
// talked to both ways in dms, or someone who went to the same spot on the
// same night. each one carries the nights out you shared and stamps for the
// cities where your dates overlapped.
//
// -> Map(memberNo -> { nights, talked, stamps: [{ city, month }] })
export async function connectionsFor(memberNo) {
  const [{ data: threads }, { data: myNights }, { data: myTrips }] = await Promise.all([
    db.from("dm_threads").select("id, a_no, b_no").or(`a_no.eq.${memberNo},b_no.eq.${memberNo}`),
    db.from("spot_going").select("spot_id, night").eq("member_no", memberNo),
    db.from("trips").select("city, starts, ends").eq("member_no", memberNo),
  ])

  const out = new Map()
  const get = (no) => {
    if (!out.has(no)) out.set(no, { nights: 0, talked: false, stamps: new Map() })
    return out.get(no)
  }
  const stamp = (c, city, iso) => {
    const month = String(iso).slice(0, 7)
    const key = `${city}|${month}`
    if (!c.stamps.has(key)) c.stamps.set(key, { city, month })
  }

  // both of you wrote in the thread / same spot, same night (fetched together)
  const byThread = new Map((threads || []).map((t) => [t.id, t.a_no === memberNo ? t.b_no : t.a_no]))
  const nights = [...new Set((myNights || []).map((n) => n.night))]
  const none = Promise.resolve({ data: [] })
  const [{ data: msgs }, { data: others }, { data: spots }] = await Promise.all([
    byThread.size ? db.from("dm_messages").select("thread_id, from_no").in("thread_id", [...byThread.keys()]) : none,
    nights.length ? db.from("spot_going").select("spot_id, night, member_no").in("night", nights).neq("member_no", memberNo) : none,
    nights.length ? db.from("spots").select("id, city").in("id", [...new Set(myNights.map((n) => n.spot_id))]) : none,
  ])

  const wrote = new Map()
  for (const m of msgs || []) {
    const s = wrote.get(m.thread_id) || new Set()
    s.add(m.from_no === memberNo ? "me" : "them")
    wrote.set(m.thread_id, s)
  }
  for (const [id, s] of wrote) if (s.size === 2) get(byThread.get(id)).talked = true

  const mine = new Set((myNights || []).map((n) => `${n.spot_id}|${n.night}`))
  const cityOf = new Map((spots || []).map((s) => [s.id, s.city]))
  const counted = new Set()
  for (const o of others || []) {
    if (!mine.has(`${o.spot_id}|${o.night}`)) continue
    const key = `${o.member_no}|${o.night}`
    const c = get(o.member_no)
    if (!counted.has(key)) { counted.add(key); c.nights++ }
    stamp(c, cityOf.get(o.spot_id) || "medellin", o.night)
  }

  if (!out.size) return new Map()

  // drop people who opted out, banned, or test accounts; stamps: cities where
  // your dates overlapped
  const [{ data: rows }, { data: theirTrips }] = await Promise.all([
    db.from("members").select("member_no, banned, hide_connections").in("member_no", [...out.keys()]),
    db.from("trips").select("member_no, city, starts, ends, hidden").in("member_no", [...out.keys()]),
  ])
  const ok = new Set((rows || []).filter((r) => !r.banned && !r.hide_connections && r.member_no < "900").map((r) => r.member_no))
  for (const no of [...out.keys()]) if (!ok.has(no)) out.delete(no)
  if (!out.size) return out

  for (const tr of theirTrips || []) {
    if (tr.hidden || !out.has(tr.member_no)) continue
    for (const my of myTrips || []) {
      if (my.city !== tr.city || !overlaps(my.starts, my.ends, tr.starts, tr.ends)) continue
      stamp(out.get(tr.member_no), tr.city, my.starts > tr.starts ? my.starts : tr.starts)
    }
  }

  for (const c of out.values()) {
    c.stamps = [...c.stamps.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 4)
  }
  return out
}
