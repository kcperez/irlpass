import crypto from "crypto"

// a 6-digit sign-in code, derived instead of stored: hmac of the member's
// email + token + the current 15-minute window. valid for this window and the
// one before (15-30 min). on iphone, gmail opens links in its own browser, so
// typing a code keeps people signed in where they started.
const WINDOW = 15 * 60e3
export function loginCode(email, token, back = 0) {
  const win = Math.floor(Date.now() / WINDOW) - back
  const h = crypto.createHmac("sha256", process.env.SUPABASE_SERVICE_KEY || "irlpass").update(`${String(email).toLowerCase()}|${token}|${win}`).digest()
  return String(h.readUInt32BE(0) % 1e6).padStart(6, "0")
}
export const codeMatches = (email, token, code) =>
  [0, 1].some((back) => crypto.timingSafeEqual(Buffer.from(loginCode(email, token, back)), Buffer.from(String(code).padStart(6, "0").slice(0, 6))))
