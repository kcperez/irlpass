import { useEffect, useState } from "react"

// a computer gets the desktop layout (sidebar, grids, two panes); phones and
// tablets keep the phone one
const Q = "(min-width: 1024px)"
export function useDesktop() {
  const [desk, setDesk] = useState(() => typeof window !== "undefined" && window.matchMedia(Q).matches)
  useEffect(() => {
    const m = window.matchMedia(Q)
    const on = () => setDesk(m.matches)
    m.addEventListener("change", on)
    return () => m.removeEventListener("change", on)
  }, [])
  return desk
}
