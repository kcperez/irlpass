// one-off: make the small blurred preview for every member photo we store.
// usage: node --env-file=.env.local scripts/locked-thumbs.mjs
import { createClient } from "@supabase/supabase-js"
import { storeLockedThumb } from "../api/_thumb.js"

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data: members } = await db.from("members").select("member_no, photo_url").not("photo_url", "is", null)
let ok = 0, skipped = 0, failed = 0
for (const m of members) {
  if (!/\/storage\/v1\/object\/public\/avatars\/\d+\.jpg/.test(m.photo_url)) { skipped++; continue }
  try {
    const r = await fetch(m.photo_url)
    if (!r.ok) { failed++; continue }
    const done = await storeLockedThumb(m.member_no, Buffer.from(await r.arrayBuffer()))
    done ? ok++ : failed++
  } catch { failed++ }
}
console.log({ total: members.length, ok, skipped, failed })
