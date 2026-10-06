// "is it open right now?" from google's opening hours:
// [{ day: "Friday", hours: "12 to 3 PM, 6 PM to 2 AM" }, ...]
// a start with no am/pm borrows the end's ("12 to 3 PM" is noon), and late
// nights spill past midnight into the next morning.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function toMin(t, mer) {
  const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (mer === "PM") h += 12
  return h * 60 + Number(m[2] || 0)
}

// "6 PM to 2 AM" -> [1080, 1560] (end past 1440 means after midnight)
export function ranges(text) {
  const s = String(text || "").replace(/ | /g, " ").replace(/–/g, "-").trim()
  if (/open 24 hours/i.test(s)) return [[0, 1440]]
  if (!s || /closed/i.test(s)) return []
  const out = []
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\d{1,2}(?::\d{2})?)\s*(AM|PM)?\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)?$/i)
    if (!m) continue
    const endMer = (m[4] || "").toUpperCase()
    const startMer = (m[2] || endMer).toUpperCase()
    let a = toMin(m[1], startMer)
    let b = toMin(m[3], endMer)
    if (a == null || b == null) continue
    if (b <= a) b += 1440
    out.push([a, b])
  }
  return out
}

// day: 0-6 (sunday first), minute: minutes since local midnight.
// -> { open: true/false/null (unknown), until: minute it closes (may be > 1440) }
export function openAt(hours, day, minute) {
  if (!Array.isArray(hours) || !hours.length) return { open: null }
  const today = hours.find((h) => h.day === DAYS[day])
  const yday = hours.find((h) => h.day === DAYS[(day + 6) % 7])
  for (const [a, b] of ranges(today?.hours)) if (minute >= a && minute < b) return { open: true, until: b }
  // last night's late hours still running this morning
  for (const [a, b] of ranges(yday?.hours)) if (b > 1440 && minute < b - 1440) return { open: true, until: b - 1440 }
  return { open: false }
}

export const fmtMin = (m) => {
  const x = ((m % 1440) + 1440) % 1440
  const h = Math.floor(x / 60), mm = x % 60
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`
}
