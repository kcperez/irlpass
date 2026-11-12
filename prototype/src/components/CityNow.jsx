import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CircleNotch } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { cityChip, rememberCity, EVENT_CITY_SLUGS } from "../lib/cities"
import { useCitySearch } from "../lib/useCitySearch"

// "i'm in ___ now". one tap moves you: no dates to learn. under the hood it
// posts a week starting today (and ends the trip you were on elsewhere), so
// people in that city see you're there and the guide follows you.
const iso = (d) => d.toISOString().slice(0, 10)

export default function CityNow({ token, city, open, onClose, onMoved }) {
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState("")
  const found = useCitySearch(typed)

  const pick = async (c) => {
    if (c.slug === city) return onClose()
    setBusy(c.slug)
    setErr("")
    rememberCity(c)
    const now = new Date()
    const r = await fetch("/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, city: c.slug, starts: iso(now), ends: iso(new Date(now.getTime() + 6 * 86400000)), now: true }),
    }).then((x) => x.json()).catch(() => ({ error: t("couldn't switch. try again.") }))
    setBusy(null)
    if (r.error) return setErr(r.error)
    setTyped("")
    onMoved?.(c.slug)
    onClose()
  }

  // where you are first, then the cities that have something on
  const list = typed.trim() ? found.results : [...new Set([city, ...EVENT_CITY_SLUGS].filter(Boolean))].map((s) => cityChip(s))

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[460px] rounded-t-[2rem] bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
          >
            <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
            <h2 className="display mt-4 text-[28px] font-bold leading-tight">{t("where are you now?")}</h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">{t("the guide and the people around you follow you there.")}</p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={t("type a city")}
              className="mt-4 w-full rounded-[1.1rem] border border-line bg-white px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
            />
            <div className="mt-3 flex min-h-[44px] flex-wrap gap-1.5">
              {list.map((c) => (
                <button
                  key={c.slug}
                  disabled={!!busy}
                  onClick={() => pick(c)}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-bold active:scale-95 ${c.slug === city ? "border-transparent bg-ink text-cream" : "border-line bg-white"}`}
                >
                  {busy === c.slug ? <CircleNotch size={13} className="animate-spin" /> : (c.emoji || cityChip(c.slug).emoji)} {c.name}
                </button>
              ))}
              {found.loading && <CircleNotch size={16} className="m-2 animate-spin text-ink-soft" />}
              {found.none && <p className="px-1 py-2 text-[12.5px] text-ink-soft">{t("no city by that name")}</p>}
            </div>
            {err && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{err}</p>}
            <button onClick={onClose} className="mt-4 w-full py-2.5 text-[13.5px] font-bold text-ink-soft">{t("cancel")}</button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
