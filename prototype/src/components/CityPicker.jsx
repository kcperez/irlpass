import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { cityChip } from "../lib/cities"

// which city you're looking at. looking is free and never moves you: your own
// city stays where your phone (and your dates) say you are.
export const EXPLORE = ["miami", "new-york", "los-angeles", "medellin", "palermo"]

export default function CityPicker({ token, me, open, current, onPick, onClose }) {
  const [dates, setDates] = useState([])
  useEffect(() => {
    if (!open) return
    fetch(`/api/trips?t=${token}`).then((r) => r.json()).then((d) => setDates([...new Set((d.trips || []).map((x) => x.city))])).catch(() => {})
  }, [open, token])
  const here = me?.city || "medellin"
  const mine = dates.filter((c) => c !== here)
  const rest = EXPLORE.filter((c) => c !== here && !mine.includes(c))
  const Row = ({ c, note }) => (
    <button onClick={() => onPick(c)} className={`flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left ${current === c ? "bg-ink/5" : "hover:bg-ink/5"}`}>
      <span className="text-[22px] leading-none">{cityChip(c).emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{String(cityChip(c).name || c).toLowerCase()}</span>
        {note && <span className="block text-[12px] text-ink-soft">{note}</span>}
      </span>
      {current === c && <Check size={18} weight="bold" className="text-lime" />}
    </button>
  )
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-[2px] lg:items-center">
          <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: "spring", stiffness: 320, damping: 32 }} onClick={(e) => e.stopPropagation()}
            className="max-h-[80dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[1.8rem] border border-line bg-cream px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:rounded-[1.8rem]">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line lg:hidden" />
            <p className="serif-display px-3 pt-1 text-[22px]">{t("look around")}</p>
            <p className="px-3 pb-2 text-[12.5px] text-ink-soft">{t("events, people and chats in any city. looking around never moves you.")}</p>
            <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{t("where you are")}</p>
            <Row c={here} note={t("your city right now")} />
            {mine.length > 0 && <p className="px-3 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{t("your dates")}</p>}
            {mine.map((c) => <Row key={c} c={c} />)}
            {rest.length > 0 && <p className="px-3 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{t("explore")}</p>}
            {rest.map((c) => <Row key={c} c={c} />)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
