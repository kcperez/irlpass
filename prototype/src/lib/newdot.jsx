import { useState } from "react"

// "new" dots for features people haven't opened yet. per device, the way most
// apps do it: the dot goes away the first time you tap the thing.
const k = (key) => `irl:new:${key}`
export const isSeen = (key) => {
  try { return !!localStorage.getItem(k(key)) } catch { return true }
}
export const markSeen = (key) => {
  try { localStorage.setItem(k(key), "1") } catch { /* private mode */ }
}
export function useNew(key) {
  const [fresh, setFresh] = useState(() => !isSeen(key))
  return [fresh, () => { markSeen(key); setFresh(false) }]
}

export function NewDot({ className = "" }) {
  return (
    <span className={`pointer-events-none absolute flex h-2.5 w-2.5 ${className}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8a5cf0] opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-cream bg-[#8a5cf0]" />
    </span>
  )
}
