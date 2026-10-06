import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CircleNotch, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { cityChip } from "../lib/cities"

// "heading to bangkok?": what to download, how to get around, money, what to
// watch out for, how things work, your first night. one per trip city.
const ICON = { apps: "📲", around: "🛺", money: "💸", watch: "👀", local: "🤝", first: "🌙" }

export default function CityBrief({ token, city, starts }) {
  const [open, setOpen] = useState(false)
  const [d, setD] = useState(null)
  const [err, setErr] = useState("")
  const c = cityChip(city)
  const here = starts && starts <= new Date().toISOString().slice(0, 10)

  // warm it up quietly so it's ready when they tap (the first one per city takes a bit)
  useEffect(() => {
    let alive = true
    setD(null)
    fetch(`/api/brief?t=${token}&city=${city}`)
      .then((r) => r.json())
      .then((x) => { if (!alive) return; x.brief ? setD(x) : setErr(x.error || "") })
      .catch(() => alive && setErr(t("couldn't put that together right now")))
    return () => { alive = false }
  }, [token, city])

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-[1.5rem] border-2 border-ink bg-white px-4 py-3 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[24px]">{c.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight">{here ? `${t("in")} ${c.name.toLowerCase()}? ${t("stuff you should know")}` : `${t("heading to")} ${c.name.toLowerCase()}? ${t("stuff you should know")}`}</span>
          <span className="block truncate text-[12px] text-ink-soft">{d?.brief?.headline || t("apps, getting around, money, what to watch out for")}</span>
        </span>
        <span className="shrink-0 text-[18px]">🧳</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 32 }}
              className="fixed inset-x-0 bottom-0 top-10 z-50 mx-auto flex max-w-[460px] flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
            >
              <div className="flex items-start justify-between px-5 pb-2 pt-5">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{c.emoji} {c.name.toLowerCase()} · {t("before you land")}</p>
                  <h2 className="display text-[26px] font-bold leading-tight">{d?.brief?.headline || t("stuff you should know")}</h2>
                </div>
                <button onClick={() => setOpen(false)} aria-label={t("close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><X size={18} weight="bold" /></button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
                {!d && !err && (
                  <div className="flex flex-col items-center gap-3 py-16 text-ink-soft">
                    <CircleNotch size={24} className="animate-spin" />
                    <p className="text-[13px] font-semibold">{t("asking around")} {c.name.toLowerCase()}…</p>
                  </div>
                )}
                {err && !d && <p className="py-12 text-center text-[14px] text-ink-soft">{err}</p>}
                {d?.brief?.sections?.map((sec, i) => (
                  <motion.section
                    key={sec.key || i}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="rounded-[1.4rem] bg-white p-4 shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_24px_-14px_rgba(58,50,44,0.3)]"
                  >
                    <p className="text-[15px] font-bold">{ICON[sec.key] || "✦"} {sec.title}</p>
                    <ul className="mt-2 space-y-2">
                      {(sec.items || []).map((it, j) => (
                        <li key={j} className="text-[13.5px] leading-snug">
                          {it.name && <span className="font-bold">{it.name}: </span>}
                          {it.text}
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
