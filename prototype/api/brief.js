import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { cityLabel, isValidCity } from "./_cities.js"

// "heading to bangkok? get grab, uber isn't there." the stuff you should know
// before you land: apps, money, getting around, what to watch out for, how
// people do things there. claude writes it once per city with live search,
// we keep it for a month, and everyone going there shares it.
// GET ?t=&city=slug -> { city, name, brief: { headline, sections: [{ key, title, items: [{ name?, text }] }] } }
export const config = { maxDuration: 60 }
const FRESH_MS = 30 * 864e5

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

export default async function handler(req, res) {
  const me = await getUser(req.query?.t)
  if (!me) return res.status(401).json({ error: "not a member" })
  const city = String(req.query?.city || "")
  if (!isValidCity(city)) return res.status(400).json({ error: "which city?" })
  const name = cityLabel(city)
  const key = `brief:${city}`

  try {
    const { data: row } = await db.from("app_settings").select("value, updated_at").eq("key", key).maybeSingle()
    if (row?.value && Date.now() - new Date(row.updated_at).getTime() < FRESH_MS) {
      res.setHeader("cache-control", "private, max-age=3600")
      return res.status(200).json({ city, name, brief: JSON.parse(row.value) })
    }
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(503).json({ error: "briefings aren't on yet" })
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: PROMPT(name) }],
      }),
    })
    if (!r.ok) throw new Error(`claude ${r.status}`)
    const d = await r.json()
    const text = (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("")
    const brief = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "null")
    if (!brief?.sections?.length) throw new Error("no brief")
    await db.from("app_settings").upsert({ key, value: JSON.stringify(brief), updated_at: new Date().toISOString() }, { onConflict: "key" })
    return res.status(200).json({ city, name, brief })
  } catch (e) {
    console.error("brief error:", e)
    return res.status(502).json({ error: "couldn't put that together right now" })
  }
}
