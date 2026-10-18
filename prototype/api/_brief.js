import { db } from "./_db.js"
import { cityLabel } from "./_cities.js"
import { placeKind } from "./_realcity.js"

// the starter kit for a city: what to download, getting around, money, watch-outs,
// how things work, your first night. made once per city (claude + live search),
// kept a month, shared by everyone headed there. built the moment someone posts
// dates in a new city, so it's ready before they open it.
const FRESH_MS = 30 * 864e5
const inFlight = new Map()
// a kit is for a city. "united states" or "italy" as a destination gets none
// (nor anything osm can't place at all), and we remember that so it isn't
// looked up again
const NO_KIT = new Set(["country", "continent"])
const SKIP = { skip: true }

const PROMPT = (name) => `someone from irlpass (a social travel app, mostly people 22-35 going out and meeting people) is heading to ${name}.
search the web and write what they should know before they land. be specific to ${name} and current: real app names, real neighborhoods, real scams. no generic travel advice.

reply only json:
{"headline":"one line, max 12 words",
 "sections":[
  {"key":"apps","title":"download before you land","items":[{"name":"app name","text":"what it's for there, and why not the usual one"}]},
  {"key":"around","title":"getting around","items":[{"text":"..."}]},
  {"key":"money","title":"money","items":[{"text":"..."}]},
  {"key":"watch","title":"watch out for","items":[{"text":"..."}]},
  {"key":"local","title":"how it works here","items":[{"text":"..."}]},
  {"key":"first","title":"your first night","items":[{"text":"..."}]}
 ]}
3-5 items per section. write like a friend who lives there: lowercase, plain, specific, max 22 words per item. no em dashes, no hype words.`

async function stored(city) {
  const { data: row } = await db.from("app_settings").select("value, updated_at").eq("key", `brief:${city}`).maybeSingle()
  if (row?.value && Date.now() - new Date(row.updated_at).getTime() < FRESH_MS) return JSON.parse(row.value)
  return null
}

export async function getBrief(city) {
  const v = await stored(city)
  return v?.sections ? v : null
}

export async function ensureBrief(city) {
  const have = await stored(city)
  if (have?.skip) return null
  if (have?.sections) return have
  if (inFlight.has(city)) return inFlight.get(city)
  const job = (async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    const kind = await placeKind(city)
    if (!kind || NO_KIT.has(kind)) {
      await db.from("app_settings").upsert({ key: `brief:${city}`, value: JSON.stringify(SKIP), updated_at: new Date().toISOString() }, { onConflict: "key" })
      return null
    }
    const call = () => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: PROMPT(cityLabel(city)) }],
      }),
    })
    let r = await call()
    // busy (lots of new cities at once): wait a beat and try once more
    if (r.status === 429 || r.status === 529 || r.status === 503) {
      await new Promise((ok) => setTimeout(ok, 15000))
      r = await call()
    }
    if (!r.ok) throw new Error(`claude ${r.status}`)
    const d = await r.json()
    // the json is the last text block (search citations come before it)
    const texts = (d.content || []).filter((c) => c.type === "text").map((c) => c.text)
    let brief = null
    for (const tx of [texts.join(""), ...texts.reverse()]) {
      const m = tx.match(/\{[\s\S]*"sections"[\s\S]*\}/)
      try { brief = m ? JSON.parse(m[0]) : null } catch { brief = null }
      if (brief?.sections?.length) break
    }
    if (!brief?.sections?.length) throw new Error("no brief")
    await db.from("app_settings").upsert({ key: `brief:${city}`, value: JSON.stringify(brief), updated_at: new Date().toISOString() }, { onConflict: "key" })
    return brief
  })().finally(() => inFlight.delete(city))
  inFlight.set(city, job)
  return job
}
