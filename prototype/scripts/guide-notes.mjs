// the guide's one line per spot. every claim comes from the spot's google
// listing or its reviews (pulled 9/29); comuna 13 had no listing, so its line
// sticks to what the neighborhood is widely known for.
// usage: node --env-file=.env.local scripts/guide-notes.mjs
import { createClient } from "@supabase/supabase-js"
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const NOTES = {
  1: "a glass-roofed rooftop with a pool and the poblado skyline all around. sushi, shared plates and cocktails before the night starts.",
  2: "a leafy provenza garden under string lights. generous burgers and nachos built for sharing, and an easy crowd to start with.",
  3: "three moods in one provenza bar: 80s music and cocktails inside, a chill terrace, a ball pit, and a proper club downstairs.",
  4: "plant-filled rooms across from parque poblado and creative plates finished with flowers. one diner said it deserves a michelin star.",
  5: "modern colombian cooking in a bright room lined with plants and trees. a splurge dinner, and worth booking ahead.",
  6: "paisa comfort food done fast and well: bandeja paisa, mondongo and steaks. almost 12,000 reviews for a reason.",
  7: "the bar of medellín's 3 cordilleras brewery: their beer, good food, electronic music and small concerts, away from the poblado crowds.",
  8: "the center of poblado nightlife: bars and restaurants packed around one small park, locals and travelers mixed. start here and wander.",
  9: "a gastrobar on la 70, laureles' busiest street. people-watching over a beer, and a good room to catch a game.",
  10: "envigado's main square, just south of the city: a church, a fountain, shops all around, and big light displays at christmas.",
  11: "the best room in medellín for electronic music: an intimate salon with a serious sound system. headliners start after 1am, so expect a line.",
  12: "a provenza rooftop bar with live music and events, and a language exchange on tuesdays that makes it easy to meet people.",
  14: "a small poblado club with good music and lights. it gets tight and a little pricey, so check the service charge on your bill.",
  15: "the crossover club: a live band plays three short sets a night between every genre. smoke free, loud and a lot of fun.",
  16: "a whiskey lounge with bottles you won't find elsewhere in medellín, staff who know them, and cigars. the calm end of a night.",
  17: "half show, half club: costumed staff, live music and a room made for it. tables order a bottle, and the night takes over.",
  19: "one of medellín's best-loved cafés, 4.7 from over 4,000 reviews. excellent colombian coffee, a lavender latte and eggs benedict.",
  21: "the gym closest to provenza: plenty of machines and free weights, clean, and staff who walk you through the plans.",
  22: "a big two-floor gym inside unicentro in laureles, good for a longer stay. monthly plans only, paid by credit card.",
  23: "pine forest and trails above the city, reached by a long cable car ride that's half the point. entry costs extra at the top.",
  24: "a free, huge botanical garden with a butterfly house (separate ticket) and in situ, a very good restaurant. an easy day after a long night.",
  25: "the hillside neighborhood covered in murals, with outdoor escalators up the slope and street performers. best with a local guide.",
  26: "a replica paisa village on top of cerro nutibara, with views over the valley and cheap snacks from the stalls at the top.",
}

for (const [id, blurb] of Object.entries(NOTES)) {
  const { error } = await db.from("spots").update({ blurb }).eq("id", Number(id))
  if (error) console.error(id, error.message)
}
// closed or unconfirmed: a review says sixttina shut down, café velvet only
// matches other businesses, calle 9+1 only matches a hookah bar
await db.from("spots").update({ active: false }).in("id", [13, 18, 20])
const { data } = await db.from("spots").select("id, mood, name, active, blurb, photos").order("id")
const live = data.filter((s) => s.active)
console.log(`live spots: ${live.length} (${["pregame", "afters", "chill"].map((m) => `${m} ${live.filter((s) => s.mood === m).length}`).join(", ")})`)
console.log("missing a note:", live.filter((s) => !s.blurb).map((s) => s.name))
console.log("missing photos:", live.filter((s) => !s.photos?.length).map((s) => s.name))
