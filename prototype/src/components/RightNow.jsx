import { useContext, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowsClockwise, ArrowUpRight, CircleNotch, X } from "@phosphor-icons/react"
import { DaySheet } from "./DayPlan"
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

// the shuffle is a spin, not a loading bar: places roll past, and a status
// line says what it's doing right now (like claude does), so a 10-20s search
// feels like work happening, never like it froze
const ROLL = ["🍜", "☕", "🍸", "🪩", "🌮", "🥂", "🎧", "🍣", "🧃", "🌇", "🎲", "🍕"]
function Spinner({ emoji, city }) {
  const [i, setI] = useState(0)
  const [ms, setMs] = useState(0)
  useEffect(() => {
    const a = setInterval(() => setI((x) => x + 1), 90)
    const b = setInterval(() => setMs((x) => x + 500), 500)
    return () => { clearInterval(a); clearInterval(b) }
  }, [])
  const where = city ? city.toLowerCase() : t("your area")
  const steps = [
    t("checking the time and where you are"),
    t("finding what's open right now"),
    `${t("asking around")} ${where}`,
    t("reading the reviews"),
    t("skipping the tourist traps"),
    t("picking your six"),
  ]
  const step = Math.min(steps.length - 1, Math.floor(ms / 2600))
  const slow = ms > 17000
  // eases toward 92% so it always looks like it's moving
  const pct = Math.min(92, 100 * (1 - Math.exp(-ms / 9000)))
  return (
    <div className="flex h-[320px] flex-col items-center justify-center gap-4 rounded-[1.6rem] bg-white px-6">
      <div className="flex gap-3">
        {[0, 1, 2].map((k) => (
          <motion.span
            key={`${k}-${i}`}
            initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.08 }}
            className="flex h-20 w-16 items-center justify-center rounded-2xl bg-cream-deep text-[38px]"
          >
            {ROLL[(i + k * 5) % ROLL.length]}
          </motion.span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={slow ? "slow" : step}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          className="text-center text-[13.5px] font-bold text-ink"
        >
          {emoji} {slow ? t("still on it. good spots take a second") : steps[step]}…
        </motion.p>
      </AnimatePresence>
      <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-cream-deep">
        <motion.div animate={{ width: `${pct}%` }} transition={{ ease: "easeOut", duration: 0.5 }} className="h-full rounded-full bg-ink" />
      </div>
    </div>
  )
}

export default function RightNow({ token, me, onPaywall, trips = [], compact = false }) {
  const [dayOpen, setDayOpen] = useState(false)
  const openSpot = useContext(SpotLink)
  const [feeling, setFeeling] = useState(null)
  const [res, setRes] = useState(null) // { picks, cityName, left }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [seen, setSeen] = useState([])
  const city = cityChip(me?.city || "medellin")
  const clock = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()

  const [aheadCity, setAheadCity] = useState(null) // planning a trip you haven't started yet
  const [lastHere, setLastHere] = useState(null)
  // what you already got per place ("here" or a trip city), so switching tabs
  // never throws away a shuffle. only the shuffle button makes new picks
  const [kept, setKept] = useState({})
  const placeKey = (k, c) => `${k}|${c || "here"}`
  useEffect(() => {
    if (feeling && res?.picks?.length) setKept((m) => ({ ...m, [placeKey(feeling, aheadCity)]: { res, seen } }))
  }, [res, seen]) // eslint-disable-line react-hooks/exhaustive-deps
  const switchTo = (c) => {
    if (c === aheadCity || busy) return
    const hit = kept[placeKey(feeling, c)]
    setAheadCity(c)
    setErr("")
    if (hit) { setRes({ ...hit.res, ahead: hit.res.ahead?.length ? hit.res.ahead : res?.ahead }); setSeen(hit.seen); return }
    setSeen([])
    ask(feeling, false, c)
  }
  const ask = async (key, more = false, cityOverride) => {
    const planCity = cityOverride !== undefined ? cityOverride : aheadCity
    setFeeling(key)
    setBusy(true)
    setErr("")
    if (!more) setRes((r) => (r ? { ahead: r.ahead, cityName: r.cityName } : null))
    const here = await whereAmI()
    setLastHere(here)
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
        city: planCity || undefined,
      }),
    }).then(async (x) => ({ status: x.status, d: await x.json().catch(() => ({})) })).catch(() => ({ status: 0, d: {} }))
    setBusy(false)
    if (r.status === 402) { onPaywall?.({ reason: "shuffle" }); return }
    if (!r.d?.picks) { setErr(r.d?.error || t("couldn't find picks right now")); return }
    setRes(r.d)
    if (r.d.cityName) { const c = r.d.cityName.toLowerCase(); setLastCity(c); try { sessionStorage.setItem("irl:now-city", c) } catch { /* private mode */ } }
    setSeen([...skip, ...r.d.picks.map((p) => String(p.id ?? p.name))])
  }

  // a check-in push ("hungry?") opens straight onto the picks
  useEffect(() => {
    const on = (e) => { if (FEELINGS.some((x) => x.key === e.detail)) ask(e.detail) }
    window.addEventListener("irl:now", on)
    return () => window.removeEventListener("irl:now", on)
  })
  // fresh places get their photos a few seconds after the list lands: poll and fade them in
  useEffect(() => {
    const missing = (res?.picks || []).filter((p) => !p.photo && p.ref).map((p) => p.ref)
    if (!missing.length) return
    let tries = 0
    const id = setInterval(async () => {
      tries++
      const d = await fetch(`/api/spot-photos?t=${token}&ids=${missing.join(",")}`).then((r) => r.json()).catch(() => null)
      const got = d?.photos || {}
      if (Object.keys(got).length) {
        setRes((r) => r && { ...r, picks: r.picks.map((p) => (got[p.ref] && !p.photo ? { ...p, photo: got[p.ref].photo, facts: p.facts || (got[p.ref].rating ? `${got[p.ref].rating}★` : "") } : p)) })
      }
      if (tries > 20 || missing.every((m) => got[m])) clearInterval(id)
    }, 3000)
    return () => clearInterval(id)
  }, [res?.picks?.length, res?.cityName, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const [openCard, setOpenCard] = useState(null)
  const [going, setGoing] = useState({})
  const [swapping, setSwapping] = useState(null)
  // "i'm going" right from the pick: you're on that spot's board tonight
  const goTo = async (p) => {
    setGoing((g) => ({ ...g, [p.id]: true }))
    navigator.vibrate?.(12)
    await fetch("/api/mood", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, action: "going", spotId: p.id, on: true }) }).catch(() => {})
  }
  // don't like one? swap just that card
  const swap = async (i) => {
    setSwapping(i)
    const now = new Date()
    const skip = [...seen, ...(res?.picks || []).map((p) => String(p.ref ?? p.name))]
    const r = await fetch("/api/now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, feeling, day: now.getDay(), minute: now.getHours() * 60 + now.getMinutes(), seen: skip, city: aheadCity || undefined, ...(lastHere ? { lat: lastHere.lat, lng: lastHere.lng } : {}) }),
    }).then(async (x) => ({ status: x.status, d: await x.json().catch(() => ({})) })).catch(() => ({ status: 0, d: {} }))
    setSwapping(null)
    if (r.status === 402) { onPaywall?.({ reason: "shuffle" }); return }
    const next = r.d?.picks?.find((p) => !skip.includes(String(p.ref ?? p.name)))
    if (!next) return
    setSeen((x) => [...x, String(next.ref ?? next.name)])
    setRes((x) => x && { ...x, picks: x.picks.map((p, k) => (k === i ? { ...next, label: p.label || next.label } : p)) })
  }

  const close = () => { setFeeling(null); setRes(null); setSeen([]); setErr(""); setAheadCity(null); setKept({}) }
  const [lastCity, setLastCity] = useState(() => { try { return sessionStorage.getItem("irl:now-city") || "" } catch { return "" } })
  // the loop: "irlpass sent me to oni nikkei 🎲" goes to the group chat or the story
  const share = async (p) => {
    const url = `https://irlpass.xyz/?ref=${me?.memberNo || ""}${p.id ? `&go=spot-${p.id}` : ""}`
    const text = `${f?.emoji || "🎲"} ${t("irlpass sent me to")} ${p.name}${p.area ? ` (${p.area})` : ""}. ${t("who's coming?")}`
    try {
      if (navigator.share) await navigator.share({ text, url })
      else await navigator.clipboard.writeText(`${text} ${url}`)
    } catch { /* dismissed */ }
  }
  const f = FEELINGS.find((x) => x.key === feeling)

  return (
    <>
      <section className={`overflow-hidden rounded-[1.4rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.06),0_10px_26px_-18px_rgba(58,50,44,0.4)] ${compact ? "" : "mb-3"}`}>
        {/* slim: one line + the button, then the feelings. people stay above the fold */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-semibold text-ink-soft">{lastCity || t("near you")} · {clock}</p>
            <h3 className="display truncate text-[19px] font-bold leading-tight">{t("what should i do right now?")}</h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => ask("surprise")}
            className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-bold text-cream"
          >
            {t("shuffle")}
          </motion.button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none]">
          {FEELINGS.filter((x) => x.key !== "surprise").map((x, i) => (
            <motion.button
              key={x.key}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => ask(x.key)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-cream-deep/70 px-3 py-1.5 text-[12.5px] font-semibold active:bg-ink active:text-cream"
            >
              <span className="text-[15px] leading-none">{x.emoji}</span>
              {t(x.label)}
            </motion.button>
          ))}
        </div>
        {/* a whole day, planned: the lagos page, for wherever you are */}
        <button onClick={() => setDayOpen(true)} className="flex w-full items-center gap-3 border-t border-line/60 px-4 py-3 text-left active:bg-cream-deep/40">
          <span className="text-[20px] leading-none">🗺️</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold leading-tight">{t("plan my day")}</span>
            <span className="block truncate text-[12px] text-ink-soft">{t("a timeline of where to go, with options. send it to who you're with.")}</span>
          </span>
          <span className="text-[16px] font-bold text-ink-soft">→</span>
        </button>
      </section>

      <AnimatePresence>
        {dayOpen && <DaySheet token={token} me={me} cityName={lastCity} trips={trips} onPaywall={(p) => { setDayOpen(false); onPaywall?.(p) }} onClose={() => setDayOpen(false)} />}
      </AnimatePresence>

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
                  <p className="text-[12px] text-ink-soft font-semibold">
                    {f?.emoji} {t(f?.label || "")} · {res?.cityName?.toLowerCase() || t("near you")} · {clock}
                    {res?.streak > 1 ? ` · 🔥 ${res.streak} ${t("days")}` : ""}
                  </p>
                  <h2 className="display text-[26px] font-bold leading-tight">{res?.planningAhead ? `${t("for your trip to")} ${res.cityName.toLowerCase()}` : t("go here right now")}</h2>
                </div>
                <button onClick={close} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><X size={18} weight="bold" /></button>
              </div>

              {/* where to shuffle: your phone's location by default, or any of your trip cities */}
              {res?.ahead?.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto px-5 pt-2">
                  <button
                    onClick={() => switchTo(null)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold ${!aheadCity ? "border-ink bg-ink text-cream" : "border-line bg-white/70"}`}
                  >
                    📍 {t("here")}{!aheadCity && res?.cityName ? ` · ${res.cityName.toLowerCase()}` : ""}
                  </button>
                  {res.ahead.filter((a) => aheadCity === a.city || a.name.toLowerCase() !== (res?.cityName || "").toLowerCase() || aheadCity).map((a) => (
                    <button
                      key={a.city}
                      onClick={() => switchTo(a.city)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold ${aheadCity === a.city ? "border-ink bg-ink text-cream" : "border-line bg-white/70"}`}
                    >
                      {a.now ? "🧳" : "✈️"} {a.name.toLowerCase()}{a.now ? "" : ` · ${new Date(`${a.starts}T12:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()}`}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-3">
                {busy && <Spinner emoji={f?.emoji} city={res?.cityName || lastCity} />}
                {err && <p className="py-8 text-center text-[14px] font-semibold text-ink-soft">{err}</p>}
                {!busy && res?.empty && (
                  <p className="py-8 text-center text-[14px] text-ink-soft">{t("nothing open for that right now. try another mood, or shuffle in a bit.")}</p>
                )}
                {!busy && res?.others?.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-[1.4rem] bg-ink px-4 py-3 text-cream">
                    <div className="flex -space-x-2">
                      {res.others.slice(0, 4).map((o) => (
                        <span key={o.memberNo} className="h-8 w-8 overflow-hidden rounded-full bg-cream-deep-deep">
                          {o.photo && <img src={o.photo} alt="" className="h-full w-full scale-110 object-cover blur-[1.5px]" />}
                        </span>
                      ))}
                    </div>
                    <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug">
                      {res.others.length} {res.others.length === 1 ? t("person here feels") : t("people here feel")} {t(f?.label || "")} {t("right now")}
                    </p>
                  </motion.div>
                )}
                {!busy && res?.picks?.map((p, i) => (
                  <motion.article
                    key={`${p.id ?? p.name}`}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                    className="overflow-hidden rounded-[1.6rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.06),0_12px_30px_-16px_rgba(58,50,44,0.4)]"
                  >
                    <div className="relative h-36 bg-cream-deep">
                      {p.photo ? (
                        <motion.img initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} src={p.photo} alt="" className="h-full w-full object-cover" />
                      ) : p.ref ? (
                        <div className="shimmer flex h-full w-full items-end p-3">
                          <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-ink-soft">📷 {t("getting photos")}…</span>
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#d9cdf3] via-cream-deep to-[#f4d9c4] text-[52px]">{f?.emoji}</div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[12px] font-bold text-cream">{p.label ? t(p.label) : `#${i + 1}`}</span>
                      {p.going > 0 && (
                        <span className="absolute right-3 top-3 rounded-full bg-lime px-2.5 py-1 text-[11px] font-bold">🔥 {p.going} {t("from irlpass tonight")}</span>
                      )}
                    </div>
                    <div className="p-4">
                      {/* tap the text to open the details */}
                      <button onClick={() => setOpenCard((k) => (k === (p.ref ?? p.name) ? null : p.ref ?? p.name))} className="block w-full text-left">
                        <p className="text-[12px] text-ink-soft font-semibold">{[p.category, p.area].filter(Boolean).join(" · ")}</p>
                        <h4 className="display text-[22px] font-bold leading-tight">{p.name}</h4>
                        {p.why && <p className="mt-1 text-[14.5px] leading-snug">{p.why}</p>}
                        {p.tip && <p className="mt-1.5 rounded-xl bg-cream-deep/70 px-2.5 py-1.5 text-[13px] leading-snug">💡 {p.tip}</p>}
                        {p.facts && <p className="mt-1.5 text-[12.5px] font-semibold text-ink-soft">{p.facts}</p>}
                        <AnimatePresence initial={false}>
                          {openCard === (p.ref ?? p.name) && (p.quote || p.address || p.hoursToday) && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="mt-2 space-y-1 border-t border-line/70 pt-2 text-[12.5px] text-ink-soft">
                                {p.quote && <p className="italic">“{p.quote}”</p>}
                                {p.hoursToday && <p>🕒 {t("today")}: {p.hoursToday.replace(/\u202f/g, " ").toLowerCase()}</p>}
                                {p.address && <p>📍 {p.address}</p>}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {(p.quote || p.address || p.hoursToday) && openCard !== (p.ref ?? p.name) && (
                          <p className="mt-1 text-[11.5px] font-bold text-ink-soft">{t("more about it")} ▾</p>
                        )}
                      </button>
                      <div className="mt-3 flex gap-2">
                        {p.id ? (
                          going[p.id] ? (
                            <motion.button initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={() => { close(); openSpot(p.id) }} className="flex-1 rounded-full bg-lime py-2.5 text-[13.5px] font-bold">
                              ✓ {t("you're going")} · {t("see who")}
                            </motion.button>
                          ) : (
                            <motion.button whileTap={{ scale: 0.94 }} onClick={() => goTo(p)} className="flex-1 rounded-full bg-ink py-2.5 text-[13.5px] font-bold text-cream">
                              {t("i'm going")}
                            </motion.button>
                          )
                        ) : null}
                        <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={t("maps")} className={`flex items-center justify-center gap-1 rounded-full border border-line bg-white py-2.5 text-[13.5px] font-bold ${p.id ? "px-3.5" : "flex-1"}`}>
                          {p.id ? "📍" : <>{t("maps")} <ArrowUpRight size={14} weight="bold" /></>}
                        </a>
                        <motion.button whileTap={{ rotate: 180 }} onClick={() => swap(i)} disabled={swapping === i} aria-label={t("swap this one")} className="flex items-center justify-center rounded-full border border-line px-3.5 text-[15px] disabled:opacity-50">
                          {swapping === i ? <CircleNotch size={14} className="animate-spin" /> : "🔀"}
                        </motion.button>
                        <button onClick={() => share(p)} aria-label={t("share")} className="flex items-center justify-center rounded-full border border-line px-3.5 text-[15px]">↗️</button>
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
                  {res?.picks?.length ? t("shuffle again") : t("shuffle")}{res?.cityName ? ` · ${res.cityName.toLowerCase()}` : ""}
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
