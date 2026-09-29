import { db } from "./_db.js"
import { cityLabel } from "./_cities.js"

// josh's welcome dm: a real thread from his account (member 002), pinned in
// the new member's chat tab. replies go to him. the text lives in app_settings
// so he edits it from ops. no email with it: it's waiting when they open the app.
export const WELCOME_FROM = "002"
export const DEFAULT_WELCOME =
  "hey {first name}, i'm joshua, i started irlpass. welcome to {city}. i'm out a few nights a week and i'd love to meet you. check the mood tab to see where people are going tonight. reply here anytime, it's actually me reading these."

export async function welcomeText() {
  const { data } = await db.from("app_settings").select("value").eq("key", "welcome_dm").maybeSingle()
  return data?.value || DEFAULT_WELCOME
}

const pair = (x, y) => (x < y ? [x, y] : [y, x])

// returns true when a welcome went out, false when they already have a thread with josh
export async function sendWelcome(member, template) {
  if (!member || member.member_no === WELCOME_FROM) return false
  const [a, b] = pair(WELCOME_FROM, member.member_no)
  const { data: existing } = await db.from("dm_threads").select("id").eq("a_no", a).eq("b_no", b).maybeSingle()
  if (existing) return false
  const first = String(member.name || "").trim().split(/\s+/)[0] || "there"
  const city = cityLabel(member.home_city || member.city || "medellin")
  const body = String(template || (await welcomeText()))
    .replace(/\{first name\}/gi, first.toLowerCase())
    .replace(/\{city\}/gi, city.toLowerCase())
    .slice(0, 1000)
  const now = new Date().toISOString()
  const { data: th, error } = await db.from("dm_threads").insert({ a_no: a, b_no: b, last_at: now }).select("id").single()
  if (error) throw error
  await db.from("dm_messages").insert({ thread_id: th.id, from_no: WELCOME_FROM, body })
  return true
}
