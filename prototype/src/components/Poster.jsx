// the cover for anything without a photo: a gig-poster made from its own
// name, in our type on a cobalt gradient. free, instant, and it looks meant.
// scales with its box (container query units), so one poster fits a thumb,
// a card or the full feed.
const SHADES = [
  ["#4a66ff", "#10142e"],
  ["#2c45e6", "#0b0f24"],
  ["#5b74ff", "#1a1440"],
  ["#3550f0", "#071a33"],
]
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.55'/></svg>\")"

const seedOf = (s) => [...String(s || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

export default function Poster({ title, top = "", bottom = "", seed, className = "", rounded = "" }) {
  const n = seedOf(seed ?? title)
  const [a, b] = SHADES[n % SHADES.length]
  const angle = 140 + (n % 70)
  const words = String(title || "").trim()
  // long names get smaller type so they still read as a poster
  const size = words.length > 48 ? 9 : words.length > 28 ? 11 : words.length > 16 ? 13.5 : 16
  return (
    <span className={`relative block h-full w-full overflow-hidden [container-type:size] ${rounded} ${className}`}
      style={{ background: `radial-gradient(90% 70% at ${20 + (n % 50)}% 15%, ${a}cc, transparent 65%), linear-gradient(${angle}deg, ${a}, ${b} 75%)` }}>
      <span className="absolute inset-0 opacity-[0.22] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <span className="absolute inset-0 flex flex-col justify-between p-[7cqw] text-left text-white">
        <span className="truncate text-[max(9px,4.2cqw)] font-bold uppercase tracking-[0.14em] opacity-80">{top}</span>
        <span className="serif-display line-clamp-4 break-words leading-[0.98]" style={{ fontSize: `${size}cqw` }}>{words.toLowerCase()}</span>
        <span className="truncate text-[max(9px,4.2cqw)] font-semibold opacity-75">{bottom}</span>
      </span>
    </span>
  )
}
