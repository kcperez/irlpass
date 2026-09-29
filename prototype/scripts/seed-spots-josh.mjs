// josh's 9/29 spot list. each one gets checked against its real google
// listing (scripts + ops enrich-spots) before it's trusted.
// usage: node --env-file=.env.local scripts/seed-spots-josh.mjs
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// [mood, name, area, kind, tag, search]
const SPOTS = [
  ["pregame", "Máximo", "el poblado", "restaurant", null, "Máximo restaurante Wake Living Medellín"],
  ["pregame", "Oni Nikkei", "el poblado", "restaurant", null, "Oni Nikkei Wake Living Medellín"],
  ["pregame", "Chez Migu", "el poblado", "restaurant", null, "Chez Migu Wake Living Medellín"],
  ["pregame", "Krudo Viches y Vinilos", "el poblado", "bar", null, "Krudo Viches y Vinilos Medellín"],
  ["pregame", "Glu Glu", "el poblado", "wine bar", null, "Glu Glu Wake Living Medellín"],
  ["pregame", "Osso", "el poblado", "restaurant", null, "Osso restaurante Wake Living Medellín"],
  ["pregame", "Boro", "el poblado", "restaurant", null, "Boro restaurante Wake Living Medellín"],
  ["afters", "Medallo Club", "el poblado", "club", null, "Medallo Club Medellín"],
  ["afters", "La Isla", "el poblado", "club", null, "La Isla discoteca Medellín"],
  ["afters", "Mad Radio", "el poblado", "club", null, "Mad Radio Medellín"],
  ["afters", "Mala", "el poblado", "club", null, "Mala club Medellín"],
  ["afters", "Miranda", "el poblado", "club", null, "Miranda bar Medellín"],
  ["afters", "Sonorama", "el poblado", "club", null, "Sonorama Medellín"],
  ["afters", "Afrodisia", "el poblado", "club", null, "Afrodisia Medellín"],
  ["afters", "Siete Pulgadas", "el poblado", "listening bar", null, "Siete Pulgadas listening bar Medellín"],
  ["chill", "Ely Café", "el poblado", "coffee", null, "Ely Café Wake Living Medellín"],
  ["chill", "Somos Masa", "el poblado", "bakery", null, "Somos Masa Medellín"],
  ["chill", "Mad Records Café", "el poblado", "coffee", null, "Mad Records Café Medellín"],
  ["chill", "Café Dragón", "el poblado", "coffee", null, "Café Dragón Medellín"],
  ["chill", "Azul Selva", "el poblado", "coffee", null, "Azul Selva café Medellín"],
  ["chill", "Madre", "el poblado", "wellness", "recovery", "Madre wellness Medellín"],
  ["chill", "Wake Medellín", "el poblado", "wellness", "recovery", "Wake Medellín wellness"],
  ["chill", "Wake Biohotel", "el poblado", "wellness", "recovery", "Wake Biohotel Medellín"],
  ["chill", "Sauna Space", "el poblado", "sauna", "recovery", "Sauna Space Medellín"],
  ["chill", "Crew Wellness Club", "el poblado", "wellness", "recovery", "Crew Wellness Club Medellín"],
  ["chill", "Action Black", "el poblado", "gym", "recovery", "Action Black Medellín"],
  ["chill", "Zona Azul Mercado Saludable", "el poblado", "healthy market", "recovery", "Zona Azul Mercado Saludable Medellín"],
  ["chill", "Core by Cedisalud", "el poblado", "pilates", "recovery", "Core by Cedisalud pilates El Poblado Medellín"],
  ["chill", "Wake Pilates + Yoga", "el poblado", "pilates + yoga", "recovery", "Wake Pilates Yoga Studio Medellín"],
  ["chill", "Yogalab", "el poblado", "rooftop yoga", "recovery", "Yogalab Mixa Poblado Medellín"],
]

const { data: have } = await db.from("spots").select("id, name, mood").eq("city", "medellin")
const exists = new Set((have || []).map((s) => `${s.mood}:${s.name}`))
const { data: top } = await db.from("spots").select("sort").order("sort", { ascending: false }).limit(1)
let sort = (top?.[0]?.sort || 300) + 10
const out = []
for (const [mood, name, area, kind, tag, search] of SPOTS) {
  if (exists.has(`${mood}:${name}`)) continue
  // inactive until its listing checks out
  const { data, error } = await db.from("spots").insert({ city: "medellin", mood, name, area, kind, tag, sort, active: false }).select("id").single()
  if (error) { console.error(name, error.message); continue }
  out.push({ id: data.id, name, search })
  sort += 10
}
fs.writeFileSync(process.argv[2] || "/dev/stdout", JSON.stringify(out))
console.error(`added ${out.length}`)
