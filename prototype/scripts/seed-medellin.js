// Seed ~8 Medellín activities so the board/map is never empty.
// Run AFTER applying migrations/001_freemium.sql:
//   node --env-file=.env.local scripts/seed-medellin.js
// Re-running is safe-ish: it skips activities whose exact title already exists today.
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "node:crypto"

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const bogotaToday = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)
const plusDays = (n) => new Date(Date.now() - 5 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)

// fictional seed hosts with reputation so cards feel lived-in. these member_no's
// are display-only on the activity (creator is denormalized); they don't need to
// be real member rows for the board to render.
// nº990+ so demo hosts NEVER collide with real members (real max ~nº035).
// otherwise a join on a demo plan would notify a real member by number.
const HOSTS = [
  { name: "maya", ig: "@maya.travels", memberNo: "993" },
  { name: "sofia", ig: "@sofiaroams", memberNo: "994" },
  { name: "daniel", ig: "@dvnielgo", memberNo: "995" },
  { name: "valentina", ig: "@valen.mde", memberNo: "996" },
]

const A = (title, when, place, lat, lng, emoji, details, opts = {}) => ({
  title,
  when_text: when,
  spots: opts.spots || 6,
  place_name: place,
  lat,
  lng,
  emoji,
  details,
  audience: opts.audience || "open",
  image_url: opts.image || null,
  host: opts.host || HOSTS[0],
  dayOffset: opts.dayOffset ?? 0,
})

const SEED = [
  A("sunset at pueblito paisa", "6pm, golden hour", "pueblito paisa", 6.2353, -75.5801, "🌇",
    "meet at the entrance, bring a light jacket. we'll catch the city lights after.",
    { image: "/medellin/poblado-skyline.jpg", host: HOSTS[0], dayOffset: 0 }),
  A("coffee crawl in laureles", "10am, then lunch", "laureles", 6.2459, -75.5916, "☕",
    "3 spots, starting at pergamino. flexible, come for one or all.",
    { host: HOSTS[1], dayOffset: 1 }),
  A("guatapé + la piedra day trip", "6am pickup, back by 6pm", "guatapé", 6.2342, -75.1592, "🚐",
    "shared van, ~710 steps up the rock, lunch by the water. bring sunscreen.",
    { spots: 12, image: "/medellin/guatape.jpg", host: HOSTS[2], dayOffset: 3 }),
  A("rooftop night in el poblado", "9pm", "el poblado", 6.2088, -75.5679, "🍸",
    "terraza with a view, casual, first round's on the group.",
    { spots: 10, image: "/medellin/night-terraza.jpg", host: HOSTS[3], dayOffset: 2 }),
  A("padel at envigado courts", "4pm, round-robin", "envigado", 6.1696, -75.5856, "🎾",
    "beginners welcome, rackets available to borrow.",
    { host: HOSTS[2], dayOffset: 1 }),
  A("women's brunch + walk", "11am", "provenza, el poblado", 6.2093, -75.5656, "🌸",
    "slow brunch then a loop through provenza. women & non-binary only 🌸",
    { audience: "women_nb", host: HOSTS[0], dayOffset: 2 }),
  A("comuna 13 graffiti tour", "2pm", "comuna 13", 6.2496, -75.619, "🎨",
    "guided street-art walk, escalators, the whole story. ~3 hours.",
    { spots: 8, image: "/medellin/rooftop.jpg", host: HOSTS[1], dayOffset: 4 }),
  A("run club at parque lleras", "7am", "parque lleras, el poblado", 6.2096, -75.5669, "🏃",
    "easy 5k, all paces, coffee after. find the lime caps.",
    { spots: 999, host: HOSTS[3], dayOffset: 0 }),
]

async function seed() {
  const today = bogotaToday()
  let created = 0
  for (const a of SEED) {
    const { data: existing } = await db
      .from("activities")
      .select("id")
      .eq("title", a.title)
      .gte("event_date", today)
      .limit(1)
      .maybeSingle()
    if (existing) {
      console.log(`• skip (exists): ${a.title}`)
      continue
    }
    const id = randomBytes(8).toString("hex")
    const creator = a.host
    const row = {
      id,
      title: a.title,
      when_text: a.when_text,
      spots: a.spots,
      creator,
      joined: [creator],
      place_name: a.place_name,
      lat: a.lat,
      lng: a.lng,
      emoji: a.emoji,
      details: a.details,
      event_date: plusDays(a.dayOffset),
      price_cents: null,
      city: "medellin",
      audience: a.audience,
      image_url: a.image_url,
    }
    const { error } = await db.from("activities").insert(row)
    if (error) {
      console.error(`✗ ${a.title}:`, error.message)
      continue
    }
    // kickoff chat message so the room isn't empty
    await db.from("messages").insert({
      channel: id,
      body: `${creator.name} put this on the board. say hi, lock the details, make it real.`,
      from_name: "irlpass",
      from_ig: "@irlpass.xyz",
      from_member_no: "000",
    })
    created++
    console.log(`✓ seeded: ${a.title}`)
  }
  console.log(`\ndone — ${created} new activities in medellín.`)
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
