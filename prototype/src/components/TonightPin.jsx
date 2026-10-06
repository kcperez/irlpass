import { useContext, useEffect, useState } from "react"
import { cachedJson } from "../lib/cached"
import { t } from "../lib/i18n"
import { SpotLink } from "../lib/spotlink"

// pinned at the top of the city chat: tonight's plan (yours, or the busiest
// one). tap it and you're on that spot's board. resets every night.
export default function TonightPin({ token }) {
  const openSpot = useContext(SpotLink)
  const [pin, setPin] = useState(null)
  useEffect(() => {
    cachedJson(`/api/mood?t=${token}&city=medellin`, (d) => {
      const all = Object.values(d.board || {}).flat()
      const mine = all.find((s) => s.imGoing)
      const top = [...all].sort((a, b) => b.going - a.going)[0]
      setPin(mine ? { s: mine, mine: true } : top?.going > 0 ? { s: top, mine: false } : null)
    }).catch(() => {})
  }, [token])
  if (!pin) return null
  return (
    <button onClick={() => openSpot(pin.s.id)} className="flex w-full items-center gap-3 border-b border-line/70 bg-ink px-4 py-2.5 text-left text-cream">
      <span className="out-dot h-2 w-2 shrink-0 rounded-full bg-[#5fd35f]" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
        {t("tonight")} · {pin.mine ? `${t("you're going to")} ${pin.s.name}` : pin.s.name} · {pin.s.going} {t("going")}
      </span>
      <span className="shrink-0 text-[12px] font-bold text-lime">{t("see")} →</span>
    </button>
  )
}
