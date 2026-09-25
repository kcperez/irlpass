import { t } from "./i18n"

// travel vibes, picked at signup. they rank people, they never filter anyone
// out: dates are the hard match, vibes decide who you see first.
// stored in members.interests as the plain english key, so older free-text
// interests ("coffee", "gym") still line up with these.
export const VIBES = [
  { key: "rooftops", emoji: "🌇" },
  { key: "coffee", emoji: "☕" },
  { key: "hikes", emoji: "🥾" },
  { key: "salsa", emoji: "💃" },
  { key: "techno", emoji: "🎧" },
  { key: "nightlife", emoji: "🪩" },
  { key: "food tours", emoji: "🌮" },
  { key: "gym", emoji: "🏋️" },
  { key: "wine bars", emoji: "🍷" },
  { key: "beach", emoji: "🏖️" },
  { key: "art & museums", emoji: "🖼️" },
  { key: "live music", emoji: "🎸" },
  { key: "day trips", emoji: "🚐" },
  { key: "football", emoji: "⚽" },
  { key: "coworking", emoji: "💻" },
]

export const MIN_VIBES = 3

export const vibeLabel = (key) => t(key)
export const vibeEmoji = (key) => VIBES.find((v) => v.key === key)?.emoji || "✦"

// what two people share, in vibe order, lowercased so free text still matches
export const sharedVibes = (a = [], b = []) => {
  const mine = new Set(a.map((x) => String(x).toLowerCase()))
  return b.filter((x) => mine.has(String(x).toLowerCase()))
}

// "coffee + rooftops", or "coffee, rooftops + hikes"
export const joinVibes = (list) => {
  const l = list.slice(0, 3).map(vibeLabel)
  if (l.length <= 1) return l[0] || ""
  return `${l.slice(0, -1).join(", ")} + ${l[l.length - 1]}`
}
