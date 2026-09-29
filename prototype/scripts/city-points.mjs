// one-off: every city in use gets its point (and name + flag) for the map.
// usage: node --env-file=.env.local scripts/city-points.mjs
import { createClient } from "@supabase/supabase-js"
import { saveCity } from "../api/_realcity.js"
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const [{ data: t }, { data: m }] = await Promise.all([
  db.from("trips").select("city"),
  db.from("members").select("city, home_city").lt("member_no", "900"),
])
const slugs = [...new Set([...t.map((x) => x.city), ...m.map((x) => x.city), ...m.map((x) => x.home_city)].filter(Boolean))]
for (const s of slugs) {
  await saveCity(s)
  await new Promise((r) => setTimeout(r, 1100)) // openstreetmap asks for 1 request a second
}
const { data } = await db.from("cities").select("slug, name, emoji, lat, lng").order("slug")
console.log(data.map((c) => `${c.emoji} ${c.name} ${c.lat?.toFixed(2)},${c.lng?.toFixed(2)}`).join("\n"))
