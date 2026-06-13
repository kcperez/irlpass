import { useEffect, useState, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { avatarUrl, MEMBERS } from "../data"

// the wordmark. default = official 3d logo image; text variant for surfaces
// where the lime pill would blend in (e.g. the lime pass card)
export function Logo({ size = "text-[20px]", pill = "bg-lime text-ink", className = "", text = false, h = "h-11" }) {
  if (!text) {
    return <img src="/logo.png" alt="irlpass" className={`${h} w-auto ${className}`} />
  }
  return (
    <span className={`display inline-flex items-center font-bold lowercase tracking-tight ${size} ${className}`}>
      irl
      <span
        className={`ml-[3px] inline-block -rotate-3 rounded-[0.45em] px-[0.32em] pb-[0.08em] pt-[0.02em] leading-none ${pill}`}
      >
        pass
      </span>
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
    <span className="inline-flex font-mono font-semibold tabular-nums">
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
            className={`${size} rounded-full border-2 border-cream object-cover`}
            initial={{ opacity: 0, scale: 0.5, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 18, delay: 0.15 + i * 0.07 }}
          />
        ))}
      </div>
      {extra && (
        <span className="ml-2.5 font-mono text-[11px] font-medium text-ink-soft">{extra}</span>
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
            className="mx-3 flex items-center gap-3 whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft"
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
      className={`w-full rounded-full px-6 py-4 text-[15px] font-semibold transition-colors duration-200 disabled:opacity-35 ${
        dark
          ? "bg-ink text-cream"
          : "bg-lime text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18),0_10px_24px_-12px_rgba(124,150,20,0.55)]"
      }`}
    >
      {children}
    </motion.button>
  )
}
