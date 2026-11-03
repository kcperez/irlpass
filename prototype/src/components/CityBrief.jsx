import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CircleNotch, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { cityChip } from "../lib/cities"

// "heading to bangkok?": what to download, how to get around, money, what to
// watch out for, how things work, your first night. one per trip city.
const ICON = { apps: "📲", around: "🛺", money: "💸", watch: "👀", local: "🤝", first: "🌙", lockin: "🧘" }

export default function CityBrief({ token, city, starts, shine = false }) {
  const [open, setOpen] = useState(false)
  const [d, setD] = useState(null)
  const [err, setErr] = useState("")
  const [photo, setPhoto] = useState(() => { try { return localStorage.getItem(`irl:cityphoto:${city}`) || null } catch { return null } })
  const c = cityChip(city)
  // the city's own photo as the card's thumbnail (fast, separate from the kit)
  useEffect(() => {
    let alive = true
    fetch(`/api/brief?t=${token}&city=${city}&photo=1`).then((r) => r.json()).then((x) => {
      if (!alive) return
      setPhoto(x.photo || null)
      try { if (x.photo) localStorage.setItem(`irl:cityphoto:${city}`, x.photo) } catch { /* private mode */ }
    }).catch(() => {})
    return () => { alive = false }
  }, [token, city])
  // the shine stays until they've opened it once
  const seenKey = `irl:kit-opened:${city}`
  const [opened, setOpened] = useState(() => { try { return !!localStorage.getItem(seenKey) } catch { return true } })
  const openKit = () => { setOpen(true); setOpened(true); try { localStorage.setItem(seenKey, "1") } catch { /* private mode */ } }
  // tick things off as you go (per city, on this phone)
  const ckey = `irl:kit:${city}`
  const [ticked, setTicked] = useState(() => { try { return JSON.parse(localStorage.getItem(ckey) || "{}") } catch { return {} } })
  useEffect(() => { try { setTicked(JSON.parse(localStorage.getItem(ckey) || "{}")) } catch { setTicked({}) } }, [ckey])
  const tick = (id) => setTicked((x) => {
    const n = { ...x, [id]: !x[id] }
    try { localStorage.setItem(ckey, JSON.stringify(n)) } catch { /* private mode */ }
    return n
  })
  const total = (d?.brief?.sections || []).reduce((n, sec) => n + (sec.items || []).length, 0)
  const done = Object.values(ticked).filter(Boolean).length
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
        onClick={openKit}
        className={`mb-4 flex w-full items-center gap-3 overflow-hidden rounded-[1.5rem] border border-line bg-white p-2.5 pr-4 text-left shadow-[0_1px_2px_rgba(58,50,44,0.06),0_10px_26px_-18px_rgba(58,50,44,0.4)] ${shine && !opened ? "kit-shine" : ""}`}
      >
        <span className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[1.1rem] bg-cream-deep">
          {photo
            ? <img src={photo} alt="" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-[26px]">{c.emoji}</span>}
          {photo && <span className="absolute bottom-1 right-1 text-[13px] leading-none drop-shadow">{c.emoji}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-ink-soft font-semibold">{here ? t("you're in") : t("next level")} · {c.name.toLowerCase()}</span>
          <span className="block text-[15px] font-bold leading-tight">{t("your starter kit")}</span>
          <span className="block truncate text-[12px] text-ink-soft">{d?.brief?.headline || t("apps, getting around, money, what to watch out for")}</span>
        </span>
        {total > 0 && <span className="shrink-0 rounded-full bg-lime px-2.5 py-1 tabular-nums text-[11px] font-bold">{done}/{total}</span>}
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
                  <p className="text-[12px] text-ink-soft font-semibold">🎒 {t("starter kit")} · {c.emoji} {c.name.toLowerCase()}{total ? ` · ${done}/${total}` : ""}</p>
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
                    <ul className="mt-2.5 space-y-2.5">
                      {(sec.items || []).map((it, j) => {
                        const id = `${sec.key || i}-${j}`
                        return (
                          <li key={j}>
                            <button onClick={() => tick(id)} className="flex w-full items-start gap-3 text-left">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] bg-cream-deep text-[18px] leading-none transition-opacity ${ticked[id] ? "opacity-40" : ""}`}>{it.emoji || ICON[sec.key] || "✦"}</span>
                              <span className={`min-w-0 flex-1 pt-0.5 ${ticked[id] ? "text-ink-soft" : ""}`}>
                                {it.name && <span className={`block text-[14px] font-bold leading-tight ${ticked[id] ? "line-through decoration-ink/30" : ""}`}>{it.name}</span>}
                                <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{it.text}</span>
                              </span>
                              <motion.span
                                animate={{ scale: ticked[id] ? [1, 1.25, 1] : 1 }}
                                className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${ticked[id] ? "border-transparent bg-ink text-cream" : "border-line bg-white"}`}
                              >
                                {ticked[id] ? "✓" : ""}
                              </motion.span>
                            </button>
                          </li>
                        )
                      })}
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
