// Create 3 test personas with FIXED tokens so you can jump straight into the app:
//   /?screen=app&t=<token>
// Run: node --env-file=.env.local scripts/seed-test-members.js
import { createClient } from "@supabase/supabase-js"

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

// nº990+ so test logins never collide with real members (real max ~nº035)
const TEST = [
  { token: "11111111111111111111111111111111", member_no: "991", name: "Test Man",   ig: "@test.man",   gender: "man",   paid: false, can_host: false },
  { token: "22222222222222222222222222222222", member_no: "990", name: "Test Woman", ig: "@test.woman", gender: "woman", paid: false, can_host: false },
  { token: "33333333333333333333333333333333", member_no: "992", name: "Test Paid",  ig: "@test.paid",  gender: "man",   paid: true,  can_host: true  },
]

async function seed() {
  for (const p of TEST) {
    const row = {
      ...p,
      email: `${p.member_no}@test.irlpass.xyz`,
      country: "colombia",
      city: "medellin",
      banned: false,
      photo_url: null,
      birthday: "1996-01-01",
      verified_selfie: true,
      allow_dm_from_men: true,
      show_ig_to_men: true,
      interests: ["dinners", "day trips"],
    }
    await db.from("members").delete().eq("token", p.token) // clean re-run
    const { error } = await db.from("members").insert(row)
    if (error) console.error(`✗ ${p.name}:`, error.message)
    else console.log(`✓ ${p.name.padEnd(11)} paid=${p.paid}  →  /?screen=app&t=${p.token}`)
  }
}

seed().catch((e) => { console.error(e); process.exit(1) })
