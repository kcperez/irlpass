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

// v2 (josh v5): every item is the medellín format, an emoji, a bold title and
// one short line. kits made before that get cleaned on read and remade.
export const KIT_VERSION = 2

// some cities have a lane. miami is the wellness city
const FOCUS = {
  miami: {
    note: "miami is irlpass's wellness city: people lock in on weekdays (run clubs, sauna, cold plunge, pilates, juice and coffee) and go out on weekends without overdoing it.",
    extra: { key: "lockin", title: "lock in", hint: "run clubs, sauna and cold plunge, juice and coffee spots" },
  },
}

// irlpass is how members meet people and find plans, so the kit never sends
// them to an app that does that job
const COMPETITORS = ["ZONA", "Tabler", "Timeleft", "NomadTable", "Nomad Table", "Meetup", "Bumble BFF", "Couchsurfing hangouts", "Hey! VINA", "Party With A Local", "Discotech", "Peanut"]

const PROMPT = (name, slug) => {
  const focus = FOCUS[slug]
  return `someone from irlpass (a social travel app, mostly people 22-35 going out and meeting people) is heading to ${name}.
search the web and write what they should know before they land. be specific to ${name} and current: real app names, real neighborhoods, real places, real scams. no generic travel advice.
${focus ? `${focus.note}\n` : ""}never recommend apps or services for meeting people, finding plans, nightlife guest lists or group dinners (irlpass is that), for example: ${COMPETITORS.join(", ")}.

reply only json:
{"headline":"one line, max 12 words",
 "sections":[
  {"key":"apps","title":"download before you land","items":[{"emoji":"one emoji","name":"app name","text":"..."}]},
  {"key":"around","title":"getting around","items":[{"emoji":"…","name":"2-4 word title","text":"..."}]},
  {"key":"money","title":"money","items":[...]},
${focus ? `  {"key":"${focus.extra.key}","title":"${focus.extra.title}","items":[...]},   // ${focus.extra.hint}, with real place names\n` : ""}  {"key":"watch","title":"watch out for","items":[...]},
  {"key":"local","title":"how it works here","items":[...]},
  {"key":"first","title":"your first night","items":[...]}
 ]}
every item has all three: "emoji" (exactly one emoji that fits the item), "name" (a bold 1-4 word title, like "InDrive" or "cash for taxis") and "text" (one short line, max 16 words).
3-5 items per section. write like a friend who lives there: lowercase, plain, specific. no em dashes, no hype words, no markup, no citation tags.`
}

// model text sometimes carries <cite index="..."> tags or markdown: keep the
// words, drop the markup. used on save and on every read.
const EMOJI = /\p{Extended_Pictographic}/u
const strip = (x) => String(x ?? "")
  .replace(/<\/?[a-z][^>]*>/gi, "")
  .replace(/\[(\d+(-\d+)?(,\s*)?)+\]/g, "")
  .replace(/\*\*|__|`/g, "")
  .replace(/\s+([,.;:!?])/g, "$1")
  .replace(/\s+/g, " ")
  .trim()
const firstEmoji = (x) => (String(x || "").match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/u) || [""])[0]
const isCompetitor = (x) => COMPETITORS.some((c) => String(x || "").toLowerCase().includes(c.toLowerCase()))
const SECTION_EMOJI = { apps: "📲", around: "🛺", money: "💸", watch: "👀", local: "🤝", first: "🌙", lockin: "🧘" }

export function cleanBrief(b) {
  if (!b?.sections) return b
  return {
    ...b,
    headline: strip(b.headline),
    sections: b.sections.map((sec) => ({
      key: sec.key,
      title: strip(sec.title),
      items: (sec.items || [])
        .map((it) => {
          let name = strip(it.name)
          let text = strip(it.text)
          // old kits: "name: the rest" folded into text, or no title at all
          if (!name) {
            const m = text.match(/^([^,.:]{2,32}):\s+(.+)$/)
            if (m) { name = m[1]; text = m[2] }
          }
          const emoji = firstEmoji(it.emoji) || SECTION_EMOJI[sec.key] || "✦"
          // emojis belong in the emoji slot only
          name = name.replace(new RegExp(EMOJI.source, "gu"), "").trim()
          text = text.replace(new RegExp(EMOJI.source, "gu"), "").replace(/\s+/g, " ").trim()
          return { emoji, name, text }
        })
        .filter((it) => it.text && !isCompetitor(it.name) && !isCompetitor(it.text)),
    })).filter((sec) => sec.items.length),
  }
}

async function stored(city) {
  const { data: row } = await db.from("app_settings").select("value, updated_at").eq("key", `brief:${city}`).maybeSingle()
  if (row?.value && Date.now() - new Date(row.updated_at).getTime() < FRESH_MS) {
    const v = JSON.parse(row.value)
    return v?.sections ? { ...cleanBrief(v), v: v.v || 1 } : v
  }
  return null
}

export async function getBrief(city) {
  const v = await stored(city)
  return v?.sections ? v : null
}

// a kit in the old format is served (cleaned) right away and remade behind it
export const isStale = (b) => !!b?.sections && (b.v || 1) < KIT_VERSION

export async function ensureBrief(city, { force = false } = {}) {
  const have = await stored(city)
  if (have?.skip) return null
  if (have?.sections && !force) return have
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
        messages: [{ role: "user", content: PROMPT(cityLabel(city), city) }],
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
    brief = { ...cleanBrief(brief), v: KIT_VERSION }
    await db.from("app_settings").upsert({ key: `brief:${city}`, value: JSON.stringify(brief), updated_at: new Date().toISOString() }, { onConflict: "key" })
    return brief
  })().finally(() => inFlight.delete(city))
  inFlight.set(city, job)
  return job
}
