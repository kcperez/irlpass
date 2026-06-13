// Seed content for the prototype. Numbers intentionally organic, not round.
export const CITY = {
  name: "Medellín",
  country: "Colombia",
  code: "MDE",
  travelersNow: 243,
  appliedThisWeek: 187,
  acceptedThisWeek: 23,
}

export const MEMBERS = [
  { name: "Linnea", img: 47, note: "here since march" },
  { name: "Tomás", img: 12, note: "runs the thursday dinner" },
  { name: "Sage", img: 32, note: "landed yesterday" },
  { name: "Dario", img: 53, note: "el poblado" },
  { name: "Yuki", img: 44, note: "laureles" },
  { name: "Amara", img: 25, note: "here until july" },
]

export const avatarUrl = (img) => `https://i.pravatar.cc/120?img=${img}`

export const WHATSAPP_INVITE = "https://chat.whatsapp.com/L911XxZJRO4JuxMHwpX8pa"

export const DATE_OPTIONS = [
  "i'm here right now",
  "this month",
  "next month",
  "flexible",
]

export const REASON_OPTIONS = [
  "dinners with strangers",
  "food + nightlife",
  "day trips",
  "fitness + padel",
  "coworking",
  "just landed, know nobody",
]

// tap-to-pick countries for the application (most common first, then a-z)
export const COUNTRIES = [
  { name: "united states", flag: "🇺🇸" }, { name: "colombia", flag: "🇨🇴" }, { name: "canada", flag: "🇨🇦" },
  { name: "united kingdom", flag: "🇬🇧" }, { name: "australia", flag: "🇦🇺" }, { name: "germany", flag: "🇩🇪" },
  { name: "france", flag: "🇫🇷" }, { name: "netherlands", flag: "🇳🇱" }, { name: "spain", flag: "🇪🇸" },
  { name: "mexico", flag: "🇲🇽" }, { name: "brazil", flag: "🇧🇷" }, { name: "argentina", flag: "🇦🇷" },
  { name: "austria", flag: "🇦🇹" }, { name: "belgium", flag: "🇧🇪" }, { name: "bolivia", flag: "🇧🇴" },
  { name: "chile", flag: "🇨🇱" }, { name: "china", flag: "🇨🇳" }, { name: "costa rica", flag: "🇨🇷" },
  { name: "czechia", flag: "🇨🇿" }, { name: "denmark", flag: "🇩🇰" }, { name: "dominican republic", flag: "🇩🇴" },
  { name: "ecuador", flag: "🇪🇨" }, { name: "egypt", flag: "🇪🇬" }, { name: "finland", flag: "🇫🇮" },
  { name: "greece", flag: "🇬🇷" }, { name: "guatemala", flag: "🇬🇹" }, { name: "hungary", flag: "🇭🇺" },
  { name: "india", flag: "🇮🇳" }, { name: "indonesia", flag: "🇮🇩" }, { name: "ireland", flag: "🇮🇪" },
  { name: "israel", flag: "🇮🇱" }, { name: "italy", flag: "🇮🇹" }, { name: "jamaica", flag: "🇯🇲" },
  { name: "japan", flag: "🇯🇵" }, { name: "south korea", flag: "🇰🇷" }, { name: "malaysia", flag: "🇲🇾" },
  { name: "morocco", flag: "🇲🇦" }, { name: "new zealand", flag: "🇳🇿" }, { name: "nigeria", flag: "🇳🇬" },
  { name: "norway", flag: "🇳🇴" }, { name: "panama", flag: "🇵🇦" }, { name: "paraguay", flag: "🇵🇾" },
  { name: "peru", flag: "🇵🇪" }, { name: "philippines", flag: "🇵🇭" }, { name: "poland", flag: "🇵🇱" },
  { name: "portugal", flag: "🇵🇹" }, { name: "puerto rico", flag: "🇵🇷" }, { name: "romania", flag: "🇷🇴" },
  { name: "singapore", flag: "🇸🇬" }, { name: "south africa", flag: "🇿🇦" }, { name: "sweden", flag: "🇸🇪" },
  { name: "switzerland", flag: "🇨🇭" }, { name: "thailand", flag: "🇹🇭" }, { name: "turkey", flag: "🇹🇷" },
  { name: "ukraine", flag: "🇺🇦" }, { name: "uruguay", flag: "🇺🇾" }, { name: "venezuela", flag: "🇻🇪" },
  { name: "vietnam", flag: "🇻🇳" },
]
