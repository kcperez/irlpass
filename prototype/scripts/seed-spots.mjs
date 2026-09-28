// starter mood boards for medellín (EDC weekend). josh curates from ops:
// rename, reorder, hide, add. re-running only adds spots that aren't there.
// usage: node --env-file=.env.local scripts/seed-spots.mjs
import { createClient } from "@supabase/supabase-js"
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const SPOTS = [
  // pregame: rooftops, bars, restaurants
  ["pregame", "Envy Rooftop", "el poblado", "rooftop"],
  ["pregame", "37 Park", "provenza", "bar"],
  ["pregame", "La Octava", "provenza", "bar"],
  ["pregame", "Alambique", "el poblado", "restaurant"],
  ["pregame", "Carmen", "provenza", "restaurant"],
  ["pregame", "Mondongo's", "el poblado", "restaurant"],
  ["pregame", "3 Cordilleras", "guayabal", "brewery"],
  ["pregame", "Parque Lleras", "el poblado", "street"],
  ["pregame", "Calle 70", "laureles", "street"],
  ["pregame", "Parque Envigado", "envigado", "street"],
  // afters: clubs
  ["afters", "Salón Amador", "el poblado", "club"],
  ["afters", "Vintrash", "provenza", "club"],
  ["afters", "Calle 9+1", "el poblado", "club"],
  ["afters", "Perro Negro", "el poblado", "club"],
  ["afters", "Kukaramakara", "el poblado", "club"],
  ["afters", "La Whiskería", "el poblado", "bar"],
  ["afters", "Dulce Jesús Mío", "el poblado", "bar"],
  ["afters", "Sixttina", "el poblado", "club"],
  // chill + recovery: the daytime list (coffee, gyms, walks)
  ["chill", "Pergamino", "provenza", "coffee", "recovery"],
  ["chill", "Café Velvet", "provenza", "coffee", "recovery"],
  ["chill", "Bodytech", "el poblado", "gym", "recovery"],
  ["chill", "Smart Fit", "laureles", "gym", "recovery"],
  ["chill", "Parque Arví", "santa elena", "hike", "recovery"],
  ["chill", "Jardín Botánico", "centro", "walk", "recovery"],
  ["chill", "Comuna 13", "san javier", "walk"],
  ["chill", "Pueblito Paisa", "cerro nutibara", "views"],
]

const { data: have } = await db.from("spots").select("name, mood").eq("city", "medellin")
const exists = new Set((have || []).map((s) => `${s.mood}:${s.name}`))
const rows = SPOTS.filter(([mood, name]) => !exists.has(`${mood}:${name}`))
  .map(([mood, name, area, kind, tag], i) => ({ city: "medellin", mood, name, area, kind, tag: tag || null, sort: (i + 1) * 10 }))
if (rows.length) {
  const { error } = await db.from("spots").insert(rows)
  if (error) { console.error(error.message); process.exit(1) }
}
console.log(`added ${rows.length}, already there ${SPOTS.length - rows.length}`)
