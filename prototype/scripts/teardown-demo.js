// Remove ALL demo/test data this project added to the live DB, leaving real
// members + real activities untouched. The schema migration stays.
// Run: node --env-file=.env.local scripts/teardown-demo.js
import { createClient } from "@supabase/supabase-js"

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const DEMO_TITLES = [
  "sunset at pueblito paisa",
  "coffee crawl in laureles",
  "guatapé + la piedra day trip",
  "rooftop night in el poblado",
  "padel at envigado courts",
  "women's brunch + walk",
  "comuna 13 graffiti tour",
  "run club at parque lleras",
]

// every fake/test member_no this project ever used (old colliding set + safe set)
const DEMO_MEMBER_NOS = ["901", "902", "903", "990", "991", "992", "993", "994", "995", "996"]

async function teardown() {
  // 1. find the demo activities by their exact titles
  const { data: acts } = await db.from("activities").select("id, title").in("title", DEMO_TITLES)
  const ids = (acts || []).map((a) => a.id)
  console.log(`found ${ids.length} demo activities`)

  // 2. delete their chat messages, then the activities themselves
  if (ids.length) {
    await db.from("messages").delete().in("channel", ids)
    await db.from("activities").delete().in("id", ids)
    console.log(`✓ removed ${ids.length} demo activities + their chats`)
  }

  // 3. remove the fake/test member rows (real members are nº035 and below)
  const { error } = await db.from("members").delete().in("member_no", DEMO_MEMBER_NOS)
  if (error) console.error("member cleanup error:", error.message)
  else console.log(`✓ removed test/fake members ${DEMO_MEMBER_NOS.join(", ")}`)

  console.log("\ndone — your real members + real activities are untouched.")
}

teardown().catch((e) => { console.error(e); process.exit(1) })
