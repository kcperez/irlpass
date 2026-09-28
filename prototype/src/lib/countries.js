// where someone's from, as a flag + short label. countries arrive as free text
// from the old signup form ("united states", "usa", "colombia"), so fold the
// usual spellings onto an iso code.
const CODES = {
  "united states": "us", usa: "us", "u.s.": "us", us: "us", america: "us", "united states of america": "us",
  colombia: "co", mexico: "mx", "méxico": "mx", canada: "ca", brazil: "br", brasil: "br", argentina: "ar",
  chile: "cl", peru: "pe", "perú": "pe", ecuador: "ec", venezuela: "ve", uruguay: "uy", paraguay: "py",
  bolivia: "bo", panama: "pa", "panamá": "pa", "costa rica": "cr", guatemala: "gt", honduras: "hn",
  "el salvador": "sv", nicaragua: "ni", "dominican republic": "do", "república dominicana": "do",
  "puerto rico": "pr", cuba: "cu", jamaica: "jm", aruba: "aw", "curaçao": "cw", curacao: "cw",
  "united kingdom": "gb", uk: "gb", england: "gb", scotland: "gb", ireland: "ie", germany: "de",
  france: "fr", spain: "es", "españa": "es", italy: "it", portugal: "pt", netherlands: "nl", holland: "nl",
  belgium: "be", switzerland: "ch", austria: "at", sweden: "se", norway: "no", denmark: "dk", finland: "fi",
  poland: "pl", "czech republic": "cz", czechia: "cz", hungary: "hu", romania: "ro", greece: "gr",
  croatia: "hr", serbia: "rs", ukraine: "ua", russia: "ru", turkey: "tr", "türkiye": "tr", israel: "il",
  "united arab emirates": "ae", uae: "ae", "saudi arabia": "sa", egypt: "eg", morocco: "ma",
  "south africa": "za", nigeria: "ng", kenya: "ke", ghana: "gh", india: "in", pakistan: "pk",
  bangladesh: "bd", "sri lanka": "lk", nepal: "np", china: "cn", japan: "jp", "south korea": "kr",
  korea: "kr", taiwan: "tw", "hong kong": "hk", singapore: "sg", malaysia: "my", indonesia: "id",
  thailand: "th", vietnam: "vn", philippines: "ph", australia: "au", "new zealand": "nz",
  lebanon: "lb", jordan: "jo", iran: "ir", iraq: "iq", "trinidad and tobago": "tt", haiti: "ht",
}

export const flagOf = (cc) =>
  cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : ""

// { flag, label } for a country name, or null when we can't place it
export function countryOf(name) {
  const key = String(name || "").trim().toLowerCase()
  if (!key) return null
  const cc = CODES[key]
  const label = key.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bOf\b/g, "of")
  return { flag: cc ? flagOf(cc) : "", label: cc === "us" ? "USA" : cc === "gb" ? "UK" : label }
}
