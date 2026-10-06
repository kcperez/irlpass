import webpush from "web-push"
import { db } from "./_db.js"

// web push to every device a member turned it on for. dead subscriptions
// (uninstalled, permission revoked) get cleaned up as we go.
let ready = false
function setup() {
  if (ready) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails("mailto:hello@irlpass.xyz", pub, priv)
  ready = true
  return true
}

export async function pushMember(memberNo, { title, body, url, tag }) {
  if (!setup()) return 0
  const { data: subs } = await db.from("push_subs").select("endpoint, keys").eq("member_no", memberNo)
  let sent = 0
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body, url, tag }), { TTL: 3600 })
      sent++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint)
      else console.error("push error:", e.statusCode, e.body)
    }
  }
  return sent
}
