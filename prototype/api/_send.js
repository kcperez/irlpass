import { db } from "./_db.js"
import { pushMember } from "./_push.js"
import { sendEmail } from "./_email.js"
import { cityInfo, localNow } from "./_place.js"

// engagement alerts (josh v5): "marco's down to hang", the midday nudge, a plan
// in your city, a group chat invite, run club reminders.
//   - max 2 a day per person, every day of the week
//   - quiet 11pm-9am local, sunday through thursday nights. friday and
//     saturday have no quiet hours
//   - each kind can be muted in settings
//   - no push on this phone: the same alert goes out by email
// anything past the cap or inside quiet hours waits in push_held and goes
// out in the weekly email digest. dms aren't alerts and never count.
export const KINDS = {
  down: "someone's down to hang",
  nudge: "who's free today",
  plans: "new plans in your city",
  groups: "group chat invites",
  runs: "run club",
}
const DAILY_CAP = 2

export function isQuiet(tz, at = Date.now()) {
  const { day, hour } = localNow(tz, at)
  // late evening sunday-thursday, or early morning monday-friday
  if (hour >= 23 && day >= 0 && day <= 4) return true
  if (hour < 9 && day >= 1 && day <= 5) return true
  return false
}

async function sentToday(memberNo, tz) {
  // "today" on the member's own clock
  const { min } = localNow(tz)
  const since = new Date(Date.now() - min * 60e3).toISOString()
  const { count } = await db.from("push_log").select("id", { count: "exact", head: true }).eq("member_no", memberNo).gte("sent_at", since)
  return count || 0
}

// { kind, title, body, go } -> "sent" | "held" | "muted" | "none"
export async function sendAlert(memberNo, { kind, title, body = "", go = "", tag = "" }) {
  try {
    const { data: m } = await db.from("members").select("token, name, email, notify, notify_prefs, city, banned").eq("member_no", memberNo).maybeSingle()
    if (!m || m.banned) return "none"
    if ((m.notify_prefs || {})[kind] === false) return "muted"
    const { tz } = await cityInfo(m.city || "medellin")
    if (isQuiet(tz) || (await sentToday(memberNo, tz)) >= DAILY_CAP) {
      await db.from("push_held").insert({ member_no: memberNo, kind, title, body, go: go || null })
      return "held"
    }
    const url = `https://irlpass.xyz/?screen=app&t=${m.token}${go ? `&go=${go}` : ""}`
    const pushed = await pushMember(memberNo, { title, body, url, tag: tag || kind }).catch(() => 0)
    if (!pushed) {
      // no push on any device: email instead (respects the email opt-out)
      if (!m.notify || !m.email) return "none"
      await sendEmail({
        to: m.email,
        unsub: `https://irlpass.xyz/api/notify-off?t=${m.token}`,
        subject: title,
        html: `
          <h1 style="font-size:24px;margin:0;letter-spacing:-0.5px;color:#1c1b17">${esc(title)}</h1>
          ${body ? `<p style="font-size:15px;line-height:1.6;color:#57544a;margin:12px 0 0">${esc(body)}</p>` : ""}
          <a href="${url}" style="display:block;background:#4a66ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;text-align:center;border-radius:999px;padding:14px;margin-top:20px">open irlpass</a>
          <p style="font-size:12px;color:#8a857a;text-align:center;margin:14px 0 0">get these as notifications instead: add irlpass to your home screen</p>`,
      })
    }
    await db.from("push_log").insert({ member_no: memberNo, kind })
    return "sent"
  } catch (e) {
    console.error("alert error:", e)
    return "none"
  }
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
