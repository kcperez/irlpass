// notes for josh's 9/29 spots, every claim from the listing or its reviews.
// glu glu and ely café stay hidden: both only match the wake living building,
// so their photos would be of the hotel.
// usage: node --env-file=.env.local scripts/guide-notes-josh.mjs
import { createClient } from "@supabase/supabase-js"
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const NOTES = {
  27: "mediterranean cooking in the wake building. the wagyu burger and the rib risotto are what people come back for, and the service stands out.",
  28: "nikkei in the wake building: fresh sushi, tiraditos and steak. one reviewer called it one of the best meals of their life.",
  29: "a chic french room with live piano in the wake building. order the steak tartare and the pâtés, and make it a date night.",
  30: "behind an easy-to-miss door: crudos and the grilled fish of the day, done with real craft. reviewers call it world class.",
  32: "a beef-focused kitchen in the new wake tower: small plates and exceptional cuts, done simply and done well.",
  33: "a new chef-driven kitchen upstairs in wake that plays with textures. save room for the banana dessert. opinions split, so go curious.",
  34: "a poblado club with big-night energy and staff who look after you. one guest said it felt like vegas.",
  35: "a big show club in buenos aires, known for stage performances and dancers. reviews are mixed lately, so check the cover before you go in.",
  37: "a vinyl sound bar on calle 10b: great cocktails, a stylish room and a dj who reads the room.",
  38: "a poblado dance club mixing english hip hop and reggaetón, with live performances. a go-to for a big night.",
  39: "an intimate techno and house club. the first floor has a view and runs cooler. fair cover, pricey drinks.",
  40: "a provenza bar with drag shows, good cocktails and a strong sound system.",
  41: "a listening bar in manila, poblado: some of the best cocktails in town, great music and a smoking terrace upstairs.",
  43: "fresh pastries made in front of you, great eggs and pancakes. a pretty room where service can be slow, so don't come rushed.",
  44: "a record bar that's calm in the daytime and loud at night, with live trumpets and guitars when it's busy.",
  45: "a plant-filled café that works all day: coffee and laptops in the afternoon, drinks and food as it fills up in the evening.",
  46: "a brunch spot in provenza. reviews are mixed on service, but its fans call it their favorite.",
  47: "a spotless sauna club near provenza: a sauna big enough for your whole group, ice baths and a modern space.",
  48: "the wake hotel's spa: hot, cold and warm pools, a salt water float pool, a wet sauna and an infrared sauna.",
  49: "a wellness hotel with a pool and bio rooms. a calm place to reset between big nights.",
  50: "a rooftop sauna with cold plunges around 4°c, contrast therapy and yoga. quiet, clean and properly hot.",
  51: "an indoor-outdoor fitness studio with new equipment and coached classes. some regulars rate it the best gym in medellín.",
  52: "a training center in belén with coached group classes like grit and a crew that keeps you going. a trip from poblado, worth it for regulars.",
  53: "a healthy market in poblado: good snacks, coconut water and a banana cake people like.",
  54: "a small, women-owned pilates studio in poblado, by appointment.",
  55: "pilates and yoga inside the power club in wake. challenging, fun classes, and a free first class if you message them on instagram.",
  56: "rooftop yoga and pilates on the 18th floor of mixa, with a view that keeps people coming back. 5.0 from 186 reviews.",
}

for (const [id, blurb] of Object.entries(NOTES)) {
  await db.from("spots").update({ blurb, active: true }).eq("id", Number(id))
}
// mad radio: only switch on with a medellín address, then a cautious note
const { data: mad } = await db.from("spots").select("address, category, rating, reviews").eq("id", 36).single()
if (/medell/i.test(mad?.address || "")) {
  await db.from("spots").update({ active: true, blurb: `a music bar in medellín, ${mad.rating} on google from ${mad.reviews} reviews.` }).eq("id", 36)
}
console.log("mad radio:", mad?.address)
const { data } = await db.from("spots").select("mood, active").eq("active", true)
console.log("live spots:", data.length, ["pregame", "afters", "chill"].map((m) => `${m} ${data.filter((s) => s.mood === m).length}`).join(", "))
