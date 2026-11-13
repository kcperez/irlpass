import { useEffect, useState, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { avatarUrl, MEMBERS } from "../data"

// the mark: a glossy cobalt app tile with a white ticket in it (the pass),
// lit from the top so it reads 3d. used alone as the app icon, or with the
// wordmark everywhere else.
export function Mark({ size = 32, className = "" }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden>
      <defs>
        <linearGradient id="irl-tile" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#7d93ff" />
          <stop offset="0.55" stopColor="#4a66ff" />
          <stop offset="1" stopColor="#2a3fd6" />
        </linearGradient>
        <linearGradient id="irl-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="irl-ticket" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe5ff" />
        </linearGradient>
        <filter id="irl-drop" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#0b1260" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#irl-tile)" />
      <path d="M7 18 Q7 7 19 7 H45 Q57 7 57 18 V24 Q32 30 7 24 Z" fill="url(#irl-sheen)" />
      <g transform="rotate(-10 32 33)" filter="url(#irl-drop)">
        <path d="M16 22 H48 a3 3 0 0 1 3 3 V30 a4 4 0 0 0 0 8 V43 a3 3 0 0 1 -3 3 H16 a3 3 0 0 1 -3 -3 V38 a4 4 0 0 0 0 -8 V25 a3 3 0 0 1 3 -3 Z" fill="url(#irl-ticket)" />
        <path d="M38 24.5 V43.5" stroke="#4a66ff" strokeOpacity="0.35" strokeWidth="1.6" strokeDasharray="2.4 2.4" />
        <circle cx="25.5" cy="34" r="4.2" fill="#4a66ff" />
      </g>
      <rect x="2.5" y="2.5" width="59" height="59" rx="16.5" fill="none" stroke="#fff" strokeOpacity="0.22" />
    </svg>
  )
}

// the logo: mark + "irlpass". text=false gives the mark alone.
export function Logo({ size = "text-[20px]", className = "", text = true, h = "h-11" }) {
  const px = { "h-7": 24, "h-8": 26, "h-9": 30, "h-10": 32, "h-11": 34, "h-12": 38 }[h] || 30
  if (!text) return <Mark size={px} className={className} />
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={px} />
      <span className={`serif-display lowercase leading-none tracking-[-0.04em] ${size}`} style={{ fontSize: px * 0.72 }}>irlpass</span>
    </span>
  )
}

// hand-drawn lime underline, draws itself on mount (Travo squiggle)
export function Squiggle({ className = "" }) {
  return (
    <svg viewBox="0 0 220 26" fill="none" className={className} aria-hidden>
      <motion.path
        d="M4 18 C 40 6, 70 24, 105 14 S 175 4, 216 13"
        stroke="var(--color-lime-deep)"
        strokeWidth="7"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
      />
    </svg>
  )
}

export function ColombiaFlag({ className = "w-4 h-3" }) {
  return (
    <svg viewBox="0 0 12 8" className={`${className} rounded-[1px]`} aria-hidden>
      <rect width="12" height="4" fill="#FCD116" />
      <rect y="4" width="12" height="2" fill="#003893" />
      <rect y="6" width="12" height="2" fill="#CE1126" />
    </svg>
  )
}

// breathing live dot — isolated so the loop never re-renders parents
export const LiveDot = memo(function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <motion.span
        className="absolute inset-0 rounded-full bg-lime-deep"
        animate={{ scale: [1, 2.1], opacity: [0.55, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative h-2.5 w-2.5 rounded-full bg-lime-deep" />
    </span>
  )
})

// counter that ticks up on an organic interval — the filmable artifact
export const LiveCounter = memo(function LiveCounter({ start }) {
  const [count, setCount] = useState(start)
  useEffect(() => {
    let alive = true
    let t
    const tick = () => {
      t = setTimeout(() => {
        if (!alive) return
        setCount((c) => c + 1)
        tick()
      }, 3400 + Math.random() * 3800)
    }
    tick()
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])
  const digits = String(count).split("")
  return (
    <span className="inline-flex tabular-nums font-semibold tabular-nums">
      {digits.map((d, i) => (
        <span key={i} className="relative inline-block w-[0.62em] overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={d + "-" + i + "-" + count}
              className="inline-block"
              initial={{ y: "0.9em", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-0.9em", opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              {d}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
})

export function AvatarStack({ size = "h-9 w-9", count = 5, extra }) {
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2.5">
        {MEMBERS.slice(0, count).map((m, i) => (
          <motion.img
            key={m.name}
            src={avatarUrl(m.img)}
            alt={m.name}
            className={`${size} rounded-full border border-cream object-cover`}
            initial={{ opacity: 0, scale: 0.5, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 18, delay: 0.15 + i * 0.07 }}
          />
        ))}
      </div>
      {extra && (
        <span className="ml-2.5 tabular-nums text-[11px] font-medium text-ink-soft">{extra}</span>
      )}
    </div>
  )
}

export function Marquee({ items }) {
  const row = [...items, ...items]
  return (
    <div className="overflow-hidden border-y border-line/70 bg-cream-deep/60 py-2">
      <div className="marquee-track">
        {row.map((it, i) => (
          <span
            key={i}
            className="mx-3 flex items-center gap-3 whitespace-nowrap text-[12px] font-medium text-ink-soft"
          >
            {it}
            <svg width="5" height="5" viewBox="0 0 5 5" aria-hidden>
              <circle cx="2.5" cy="2.5" r="2.5" fill="var(--color-lime-deep)" />
            </svg>
          </span>
        ))}
      </div>
    </div>
  )
}

// chunky primary button — Zulachat energy, physical press
export function BigButton({ children, onClick, disabled, dark }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      className={`w-full rounded-full px-6 py-4 text-[15px] font-semibold transition-colors duration-200 disabled:opacity-35 ${ dark ? "bg-ink text-cream" : "bg-lime text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18),0_10px_24px_-12px_rgba(124,150,20,0.55)]" }`}
    >
      {children}
    </motion.button>
  )
}
