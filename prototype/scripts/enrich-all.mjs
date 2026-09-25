// one-off: pull instagram photo + follower count for every member.
// usage: node --env-file=.env.local scripts/enrich-all.mjs [--go] [--force 001,002] [--missing]
// --missing only scrapes members with no photo yet (the photo backfill)
import { createClient } from "@supabase/supabase-js"

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const GO = process.argv.includes("--go")
const forceArg = process.argv.indexOf("--force")
const FORCE = forceArg > -1 ? (process.argv[forceArg + 1] || "").split(",") : []
const MISSING = process.argv.includes("--missing")

const { data: all } = await db
  .from("members")
  .select("member_no, name, ig, photo_url")
  .lt("member_no", "900")
  .order("member_no")
const members = MISSING ? all.filter((m) => !m.photo_url) : all

const handles = members
  .map((m) => String(m.ig || "").replace(/^@+/, "").trim().toLowerCase())
  .filter((h) => /^[a-z0-9._]{1,30}$/.test(h))
console.log(`${members.length} members, ${handles.length} usable handles`)
if (!GO) { console.log("dry run. add --go"); process.exit(0) }

// one actor run for the whole list: far cheaper than one run each
const r = await fetch(
  `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usernames: handles }) }
)
if (!r.ok) { console.log("apify failed", r.status, (await r.text()).slice(0, 200)); process.exit(1) }
const items = await r.json()
console.log("profiles returned:", items.length)

const byUser = new Map(items.filter((p) => p?.username).map((p) => [p.username.toLowerCase(), p]))

let photos = 0, stats = 0, missing = 0
for (const m of members) {
  const h = String(m.ig || "").replace(/^@+/, "").trim().toLowerCase()
  const p = byUser.get(h)
  if (!p || p.error) { missing++; continue }

  const patch = {
    ig_followers: typeof p.followersCount === "number" ? p.followersCount : null,
    ig_private: !!p.private,
    ig_checked_at: new Date().toISOString(),
  }

  const wantPhoto = !m.photo_url || FORCE.includes(m.member_no)
  const src = p.profilePicUrlHD || p.profilePicUrl
  if (wantPhoto && src) {
    try {
      const img = await fetch(src)
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer())
        const path = `avatars/${m.member_no}.jpg`
        const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${path}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            "content-type": img.headers.get("content-type") || "image/jpeg",
            "x-upsert": "true",
          },
          body: buf,
        })
        if (!up.ok) throw new Error((await up.text()).slice(0, 80))
        patch.photo_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}?v=${Date.now()}`
        photos++
      }
    } catch (e) { console.log("photo fail", m.ig, e.message) }
  }

  await db.from("members").update(patch).eq("member_no", m.member_no)
  stats++
}
console.log({ statsUpdated: stats, photosStored: photos, notFound: missing })
