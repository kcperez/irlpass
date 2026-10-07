import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { t } from "../lib/i18n"

// josh's coordination prompt. a card above the nav, never a wall: one tap
// answers, "skip" always works. daily "out tonight?"; sunday to wednesday,
// "which nights are you down this week?". answers fill tonight's board and
// the night-level view on the people tab.
const dayName = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).toLowerCase()
const dayNum = (iso) => Number(iso.slice(8, 10))

export default function NightPrompt({ token, city, hold, onAnswered }) {
  const [q, setQ] = useState(null)
  const [picked, setPicked] = useState([])
  const [done, setDone] = useState(false)
  useEffect(() => {
    let alive = true
    const id = setTimeout(() => {
      fetch(`/api/nights?t=${token}`)
        .then((r) => r.json())
        .then((d) => { if (alive && d.ask) setQ(d) })
        .catch(() => {})
    }, 1800)
    return () => { alive = false; clearTimeout(id) }
  }, [token])

  const send = async (nights, answer) => {
    setDone(true)
    await fetch("/api/nights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, nights, answer, city }),
    }).catch(() => {})
    onAnswered?.(answer)
  }

  const show = q && !done && !hold
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className="pointer-events-auto fixed inset-x-0 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 mx-auto w-[calc(100%-1.5rem)] max-w-[436px] rounded-[1.6rem] bg-ink p-4 text-cream shadow-[0_18px_40px_-14px_rgba(28,27,23,0.75)]"
        >
          {q.ask === "tonight" ? (
            <>
              <p className="display text-[21px] font-bold leading-tight">{t("out tonight?")}</p>
              <p className="text-[12.5px] text-cream/70">{t("one tap puts you on tonight's board so people can find you")}</p>
              <div className="mt-3 flex gap-2">
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => send([q.tonight], "out")} className="flex-1 rounded-full bg-lime py-3 text-[14px] font-bold text-ink">
                  🙌 {t("i'm out")}
                </motion.button>
                <button onClick={() => send([q.tonight], "skip")} className="rounded-full border border-cream/25 px-5 text-[13px] font-bold text-cream/80">
                  {t("skip")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="display text-[21px] font-bold leading-tight">{t("which nights are you down this week?")}</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {q.week.map((d) => {
                  const on = picked.includes(d)
                  return (
                    <motion.button
                      key={d}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d) : [...p, d]))}
                      className={`rounded-2xl py-2.5 text-center ${on ? "bg-lime text-ink" : "bg-cream/10 text-cream"}`}
                    >
                      <span className="block text-[11px] font-bold uppercase">{dayName(d)}</span>
                      <span className="block text-[18px] font-bold leading-tight">{dayNum(d)}</span>
                    </motion.button>
                  )
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => send(picked, "out")}
                  disabled={!picked.length}
                  className="flex-1 rounded-full bg-lime py-3 text-[14px] font-bold text-ink disabled:opacity-40"
                >
                  {t("done")}
                </button>
                <button onClick={() => send(q.week, "pass")} className="rounded-full border border-cream/25 px-5 text-[13px] font-bold text-cream/80">
                  {t("skip")}
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
