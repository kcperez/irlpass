import { useContext, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowsClockwise, ArrowUpRight, CircleNotch, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { cityChip } from "../lib/cities"
import { SpotLink } from "../lib/spotlink"

// the daily reason to open irlpass: how are you feeling? we already know your
// city (your dates) and the time, so three picks come back that are open now,
// close by, well reviewed, and where other people from irlpass are going.
export const FEELINGS = [
  { key: "hungry", emoji: "🍜", label: "hungry" },
  { key: "coffee", emoji: "☕", label: "coffee" },
  { key: "drinks", emoji: "🍸", label: "drinks" },
  { key: "dance", emoji: "🪩", label: "dance" },
  { key: "sweat", emoji: "🏋️", label: "sweat" },
  { key: "recover", emoji: "🧃", label: "recover" },
  { key: "explore", emoji: "🗺️", label: "explore" },
  { key: "surprise", emoji: "🎲", label: "surprise me" },
]

// a rough fix, asked once, remembered for the session. no fix is fine.
function whereAmI() {
  try {
    const hit = JSON.parse(sessionStorage.getItem("irl:here") || "null")
    if (hit && Date.now() - hit.at < 20 * 60e3) return Promise.resolve(hit)
  } catch { /* private mode */ }
  if (!navigator.geolocation) return Promise.resolve(null)
  return new Promise((done) => {
    const stop = setTimeout(() => done(null), 5000)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(stop)
        const hit = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }
        try { sessionStorage.setItem("irl:here", JSON.stringify(hit)) } catch { /* private mode */ }
        done(hit)
      },
      () => { clearTimeout(stop); done(null) },
      { enableHighAccuracy: false, maximumAge: 10 * 60e3, timeout: 4500 },
    )
  })
}

export default function RightNow({ token, me, onPaywall, compact = false }) {
  const openSpot = useContext(SpotLink)
  const [feeling, setFeeling] = useState(null)
  const [res, setRes] = useState(null) // { picks, cityName, left }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [seen, setSeen] = useState([])
  const city = cityChip(me?.city || "medellin")
  const clock = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()

  const ask = async (key, more = false) => {
    setFeeling(key)
    setBusy(true)
    setErr("")
    if (!more) setRes(null)
    const here = await whereAmI()
    const now = new Date()
    const skip = more ? seen : []
    const r = await fetch("/api/now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        t: token,
        feeling: key,
        day: now.getDay(),
        minute: now.getHours() * 60 + now.getMinutes(),
        lat: here?.lat,
        lng: here?.lng,
        seen: skip,
      }),
    }).then(async (x) => ({ status: x.status, d: await x.json().catch(() => ({})) })).catch(() => ({ status: 0, d: {} }))
    setBusy(false)
    if (r.status === 402) { onPaywall?.({ reason: "shuffle" }); return }
    if (!r.d?.picks) { setErr(r.d?.error || t("couldn't find picks right now")); return }
    setRes(r.d)
    setSeen([...skip, ...r.d.picks.map((p) => String(p.id ?? p.name))])
  }

  const close = () => { setFeeling(null); setRes(null); setSeen([]); setErr("") }
  const f = FEELINGS.find((x) => x.key === feeling)

  return (
    <>
      <section className={`overflow-hidden rounded-[1.75rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.06),0_14px_34px_-18px_rgba(58,50,44,0.45)] ${compact ? "" : "mb-4"}`}>
        <div className="bg-gradient-to-br from-[#e6dcfa] via-[#f6efe6] to-[#fbe1cf] px-4 pb-3 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
            {t("right now")} · {city.emoji} {city.name.toLowerCase()} · {clock}
          </p>
          <h3 className="display mt-0.5 text-[24px] font-bold leading-tight">{t("how are you feeling?")}</h3>
        </div>
        <div className="grid grid-cols-4 gap-1.5 p-3">
          {FEELINGS.map((x, i) => (
            <motion.button
              key={x.key}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => ask(x.key)}
              className="flex flex-col items-center gap-0.5 rounded-2xl bg-cream-deep/60 py-2.5 active:bg-lime"
            >
              <span className="text-[22px] leading-none">{x.emoji}</span>
              <span className="text-[11px] font-bold">{t(x.label)}</span>
            </motion.button>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {feeling && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 32 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(e, info) => { if (info.offset.y > 120 || info.velocity.y > 650) close() }}
              className="fixed inset-x-0 bottom-0 top-10 z-50 mx-auto flex max-w-[460px] flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
            >
              <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-line" />
              <div className="flex items-start justify-between px-5 pt-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{f?.emoji} {t(f?.label || "")} · {res?.cityName?.toLowerCase() || city.name.toLowerCase()} · {clock}</p>
                  <h2 className="display text-[26px] font-bold leading-tight">{t("go here right now")}</h2>
                </div>
                <button onClick={close} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><X size={18} weight="bold" /></button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-3">
                {busy && !res && [0, 1, 2].map((i) => <div key={i} className="shimmer h-[220px] rounded-[1.6rem]" />)}
                {err && <p className="py-8 text-center text-[14px] font-semibold text-ink-soft">{err}</p>}
                {res?.empty && (
                  <p className="py-8 text-center text-[14px] text-ink-soft">{t("nothing open for that right now. try another mood, or shuffle in a bit.")}</p>
                )}
                {res?.picks?.map((p, i) => (
                  <motion.article
                    key={`${p.id ?? p.name}`}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                    className="overflow-hidden rounded-[1.6rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.06),0_12px_30px_-16px_rgba(58,50,44,0.4)]"
                  >
                    <div className="relative h-36 bg-cream-deep">
                      {p.photo ? (
                        <img src={p.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#d9cdf3] via-cream-deep to-[#f4d9c4] text-[52px]">{f?.emoji}</div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] font-bold text-cream">#{i + 1}</span>
                      {p.going > 0 && (
                        <span className="absolute right-3 top-3 rounded-full bg-lime px-2.5 py-1 text-[11px] font-bold">🔥 {p.going} {t("from irlpass tonight")}</span>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{[p.category, p.area].filter(Boolean).join(" · ")}</p>
                      <h4 className="display text-[22px] font-bold leading-tight">{p.name}</h4>
                      {p.why && <p className="mt-1 text-[14px] leading-snug">{p.why}</p>}
                      {p.facts && <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">{p.facts}</p>}
                      <div className="mt-3 flex gap-2">
                        {p.id ? (
                          <motion.button whileTap={{ scale: 0.96 }} onClick={() => { close(); openSpot(p.id) }} className="flex-1 rounded-full bg-ink py-2.5 text-[13.5px] font-bold text-cream">
                            {t("see who's going")}
                          </motion.button>
                        ) : null}
                        <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-center gap-1 rounded-full border-2 border-ink py-2.5 text-[13.5px] font-bold ${p.id ? "px-4" : "flex-1"}`}>
                          {t("maps")} <ArrowUpRight size={14} weight="bold" />
                        </a>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>

              <div className="border-t border-line/70 bg-cream/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => ask(feeling, true)}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-[15px] font-bold disabled:opacity-60"
                >
                  {busy ? <CircleNotch size={17} className="animate-spin" /> : <ArrowsClockwise size={17} weight="bold" />}
                  {t("shuffle")}
                </motion.button>
                {res?.left != null && (
                  <p className="mt-1.5 text-center text-[11.5px] text-ink-soft">
                    {res.left > 0 ? `${res.left} ${t("free picks left today")}` : t("last free pick today. the pass makes it unlimited")}
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
