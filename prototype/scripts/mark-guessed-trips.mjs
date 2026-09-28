// one-off: flag trips that came from the old preset buttons (fixed windows
// relative to the day they were posted) so their owners get asked to confirm.
// usage: node --env-file=.env.local scripts/mark-guessed-trips.mjs [--go]
import { createClient } from "@supabase/supabase-js"
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const GO = process.argv.includes("--go")
const d = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const near = (x, y) => Math.abs(x - y) <= 1
const { data: trips } = await db.from("trips").select("*").lt("member_no", "900")
const guessed = trips.filter((t) => {
  const s = d(t.created_at.slice(0, 10), t.starts), len = d(t.starts, t.ends)
  return (t.local && near(len, 89)) || (near(s, 0) && near(len, 29)) || (near(s, 30) && near(len, 6)) ||
    (near(s, 7) && near(len, 6)) || (near(s, 0) && near(len, 13)) || (near(s, 0) && near(len, 6))
})
console.log(`${guessed.length} of ${trips.length} trips look like preset guesses`)
if (GO && guessed.length) {
  const { error } = await db.from("trips").update({ guess: true }).in("id", guessed.map((t) => t.id))
  console.log(error ? error.message : "flagged")
}
