import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, ArrowUpRight, CircleNotch, Sparkle, Star, X } from "@phosphor-icons/react"
import { t, LANG } from "../lib/i18n"
import { cityChip } from "../lib/cities"
import { cachedJson } from "../lib/cached"
import { haptic } from "../lib/haptic"
import CityBrief from "../components/CityBrief"
import Poster from "../components/Poster"

// the city tab: your travel pack for wherever you're looking. ask it anything
// (dinner, the airport, techno tonight), see what's featured this week, where
// to eat, how to get around, and who's here.
const TZ = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome", barcelona: "Europe/Madrid" }
const QUICK = [
  ["🍝", "hungry", "somewhere great to eat right now"],
  ["☕", "coffee", "the best coffee near the center"],
  ["🍸", "drinks", "a great bar for tonight"],
  ["🎶", "tonight", "what's good to do tonight"],
  ["🚕", "getting around", "how do i get around the city and from the airport"],
  ["🆓", "free", "free things to do this week"],
]
const MICHELIN = { star: "michelin ★", bib: "bib gourmand", guide: "michelin guide" }
const when = (iso, city) => new Date(iso).toLocaleString([], { timeZone: TZ[city] || undefined, weekday: "short", hour: "numeric", minute: "2-digit" }).toLowerCase()
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase()

function PlaceCard({ p, i }) {
  const [broken, setBroken] = useState(false)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="overflow-hidden rounded-[1.4rem] border border-line bg-white">
      <div className="relative aspect-[16/10] bg-cream-deep">
        {p.photo && !broken ? (
          <img src={p.photo} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <Poster title={p.name} seed={p.name} bottom={p.area} />
        )}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">#{i + 1}</span>
        {p.michelin && <span className="absolute right-2.5 top-2.5 rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]">{MICHELIN[p.michelin]}</span>}
      </div>
      <div className="p-3.5">
        <p className="serif-display text-[19px] leading-[1.05]">{p.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-soft">
          {p.rating && <span className="flex items-center gap-0.5 font-bold text-ink"><Star size={11} weight="fill" />{p.rating.toFixed(1)}</span>}
          <span className="truncate">{[p.kind, p.area, p.price].filter(Boolean).join(" · ")}</span>
        </p>
        {p.why && <p className="mt-1.5 text-[13px] leading-snug">{p.why}</p>}
        <div className="mt-2.5 flex gap-2">
          <a href={p.maps} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-bold text-cream">{t("open in maps")}</a>
          <a href={p.url} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-bold">{t("why it's here")}</a>
        </div>
      </div>
    </motion.div>
  )
}

function EventTile({ e, city, onOpen }) {
  return (
    <button onClick={() => onOpen(e.id)} className="w-[62vw] max-w-[240px] shrink-0 overflow-hidden rounded-[1.3rem] border border-line bg-white text-left lg:w-[240px]">
      <div className="relative aspect-square">
        <span className="absolute inset-0"><Poster title={e.title} seed={e.id} top={e.category} bottom={e.venue || ""} /></span>
        {e.cover && <img src={e.cover} alt="" loading="lazy" onError={(x) => { x.currentTarget.style.display = "none" }} className="relative h-full w-full object-cover" />}
      </div>
      <div className="p-3">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">{when(e.startsAt, city)}{e.goingCount ? ` · ${e.goingCount} ${t("going")}` : ""}</p>
        <p className="serif-display mt-1 line-clamp-2 text-[16px] leading-[1.1]">{e.title}</p>
      </div>
    </button>
  )
}

export default function City({ token, city, onOpenEvent, onGoEvents, onEditDates, onOpenPeople }) {
  const name = String(cityChip(city).name || city).toLowerCase()
  const [events, setEvents] = useState(null) // null = still loading
  const [guide, setGuide] = useState(null)
  const [people, setPeople] = useState(null)
  const [trips, setTrips] = useState([])
  const [q, setQ] = useState("")
  const [ask, setAsk] = useState(null) // { q, loading } | { q, reply, tip, places, ids, near } | { q, error }

  useEffect(() => {
    let live = true
    setAsk(null); setGuide(null); setPeople(null); setEvents(null)
    cachedJson(`/api/events?t=${token}&city=${city}&lang=${LANG}`, (d) => live && setEvents(d.events || [])).catch(() => live && setEvents([]))
    cachedJson(`/api/city-guide?t=${token}&city=${city}&lang=${LANG}`, (d) => live && setGuide(d.places || [])).catch(() => live && setGuide([]))
    cachedJson(`/api/members?t=${token}&city=${city}`, (d) => live && setPeople(d.people || [])).catch(() => live && setPeople([]))
    cachedJson(`/api/trips?t=${token}`, (d) => live && setTrips(d.trips || [])).catch(() => {})
    return () => { live = false }
  }, [token, city])

  const byId = useMemo(() => new Map((events || []).map((e) => [e.id, e])), [events])

  const trip = trips.find((x) => x.city === city && x.ends >= new Date().toISOString().slice(0, 10))
  // featured: the week you're there (or this week if you're here now). hosted
  // first, then photos and the most people going. nothing in that week yet
  // (a trip a month out) falls back to the soonest good ones.
  const featured = useMemo(() => {
    if (!events) return null
    const score = (e) => (e.hosted ? 50 : 0) + (e.featured ? 20 : 0) + (e.cover ? 10 : 0) + (e.goingCount || 0) * 3 + (e.perk ? 8 : 0)
    const from = Math.max(Date.now(), trip ? Date.parse(`${trip.starts}T00:00:00`) : 0)
    const until = from + 7 * 864e5
    const inWeek = events.filter((e) => { const t0 = Date.parse(e.startsAt); return t0 < until && (Date.parse(e.endsAt || "") || t0) >= from - 864e5 })
    const pick = inWeek.length ? inWeek : events
    return pick.map((e) => ({ e, s: score(e) })).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.e)
  }, [events, trip])

  const run = async (text) => {
    const query = String(text ?? q).trim()
    if (query.length < 2) return
    haptic("soft")
    setQ(query)
    setAsk({ q: query, loading: true })
    const r = await fetch("/api/event-search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, city, q: query, lang: LANG }) })
      .then((x) => x.json()).catch(() => ({ error: t("search is down for a sec. try again.") }))
    if (r.error) return setAsk({ q: query, error: r.error })
    // the web may have added events: reload so the new ones have cards
    if ((r.ids || []).some((id) => !byId.has(id))) await fetch(`/api/events?t=${token}&city=${city}&lang=${LANG}`).then((x) => x.json()).then((d) => setEvents(d.events || [])).catch(() => {})
    setAsk({ q: query, ...r })
  }
  const clear = () => { setAsk(null); setQ("") }
  const found = ask?.ids ? [...ask.ids, ...(ask.near || [])].map((id) => byId.get(id)).filter(Boolean) : []

  return (
    <div className="min-w-0 px-5 pb-28 pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{t("your travel pack")}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <h1 className="serif-display text-[40px] leading-none">{name}</h1>
        <button onClick={onEditDates} className="mb-1 shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] font-bold">
          {trip ? `${fmtDay(trip.starts)} – ${fmtDay(trip.ends)} · ${t("edit")}` : `+ ${t("your dates")}`}
        </button>
      </div>

      {/* one bar for anything about the city */}
      <form onSubmit={(e) => { e.preventDefault(); run() }} className="mt-4 flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-4 pr-1.5">
        <Sparkle size={17} weight="fill" className="shrink-0 text-lime" />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" placeholder={`${t("ask")} ${name}: ${t("dinner, the airport, techno tonight")}`}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/60" />
        {ask && <button type="button" onClick={clear} aria-label={t("clear")} className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5"><X size={14} weight="bold" /></button>}
        <button className="rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-cream">{t("ask")}</button>
      </form>
      <div className="-mx-5 mt-2.5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {QUICK.map(([emoji, label, query]) => (
          <button key={label} onClick={() => run(query)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[13px] font-bold">{emoji} {t(label)}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {ask ? (
          <motion.section key="ask" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
            {ask.loading ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <CircleNotch size={22} className="animate-spin text-ink-soft" />
                <p className="serif-display text-[22px] leading-tight">{t("asking")} {name}…</p>
                <p className="text-[12.5px] text-ink-soft">{t("checking the guides and what's on")}</p>
              </div>
            ) : ask.error ? (
              <p className="py-10 text-center text-[14px] font-semibold">{ask.error}</p>
            ) : (
              <>
                <p className="serif-display text-[24px] leading-[1.1]">“{ask.q}”</p>
                {ask.reply && <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">{ask.reply}</p>}
                {ask.tip && (
                  <div className="mt-4 rounded-[1.3rem] border border-line bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{t("good to know")}</p>
                    <p className="mt-1.5 text-[14.5px] leading-snug">{ask.tip}</p>
                  </div>
                )}
                {ask.places?.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{ask.places.map((p, i) => <PlaceCard key={p.name} p={p} i={i} />)}</div>
                )}
                {found.length > 0 && (
                  <>
                    <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{t("events that fit")}</p>
                    <div className="-mx-5 mt-2 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">{found.slice(0, 8).map((e) => <EventTile key={e.id} e={e} city={city} onOpen={onOpenEvent} />)}</div>
                  </>
                )}
              </>
            )}
          </motion.section>
        ) : (
          <motion.div key="pack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* featured this week, RA style, then into the feed */}
            <div className="mt-6 flex items-end justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{t("featured this week")}</p>
              <button onClick={onGoEvents} className="flex items-center gap-1 text-[12.5px] font-bold">{t("all events")} <ArrowRight size={13} weight="bold" /></button>
            </div>
            <div className="-mx-5 mt-2.5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              {featured === null
                ? [0, 1, 2].map((i) => <div key={i} className="aspect-[3/4] w-[62vw] max-w-[240px] shrink-0 animate-pulse rounded-[1.3rem] border border-line bg-white/60 lg:w-[240px]" />)
                : featured.length
                  ? featured.map((e) => <EventTile key={e.id} e={e} city={city} onOpen={onOpenEvent} />)
                  : (
                    <div className="w-full rounded-[1.3rem] border border-dashed border-line p-4">
                      <p className="text-[14px] font-bold">{t("we're pulling")} {name}{t("'s events now")}</p>
                      <p className="text-[12.5px] text-ink-soft">{t("check back tomorrow, or ask above: techno tonight, a christmas market, a match.")}</p>
                    </div>
                  )}
            </div>

            {/* eat & drink, ranked by the guides */}
            <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{t("eat & drink")}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">{t("michelin picks first, then the places locals line up for")}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {guide === null
                ? [0, 1].map((i) => (
                  <div key={i} className="flex aspect-[16/14] animate-pulse items-end rounded-[1.4rem] border border-line bg-white/60 p-4">
                    {i === 0 && <p className="text-[12.5px] font-semibold text-ink-soft">{t("finding the best places in")} {name}…</p>}
                  </div>
                ))
                : guide.slice(0, 6).map((p, i) => <PlaceCard key={p.name} p={p} i={i} />)}
            </div>

            {/* getting around: the starter kit */}
            <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{t("get around")}</p>
            <div className="mt-2.5"><CityBrief token={token} city={city} starts={trip?.starts} /></div>

            {/* who's here: only when there's someone */}
            <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{t("who's here this week")}</p>
            {people?.length ? (
              <button onClick={onOpenPeople} className="mt-2.5 flex w-full items-center gap-3 rounded-[1.3rem] border border-line bg-white p-3.5 text-left">
                <span className="flex -space-x-2">
                  {people.slice(0, 5).map((p) => (
                    <span key={p.memberNo} className="h-9 w-9 overflow-hidden rounded-full border-2 border-cream bg-cream-deep">{p.photo && <img src={p.photo} alt="" className={`h-full w-full object-cover ${p.locked ? "blur-[3px]" : ""}`} />}</span>
                  ))}
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-bold">{people.length} {t("people from irlpass")}</span>
                <ArrowUpRight size={16} weight="bold" />
              </button>
            ) : (
              <button onClick={onEditDates} className="mt-2.5 w-full rounded-[1.3rem] border border-dashed border-line p-4 text-left">
                <p className="text-[14px] font-bold">{t("nobody from irlpass is here yet")}</p>
                <p className="text-[12.5px] text-ink-soft">{t("add your dates and you're the first one people see.")}</p>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {!ask && (
        <a href="https://getty.irlpass.xyz" target="_blank" rel="noreferrer" className="mt-8 flex items-center justify-between gap-3 rounded-[1.3rem] border border-line bg-white p-4">
          <span className="min-w-0">
            <span className="block text-[14px] font-bold">{t("own a place in")} {name}?</span>
            <span className="block text-[12.5px] text-ink-soft">{t("turn your guests' stories into your marketing. 20 free a month.")}</span>
          </span>
          <span className="shrink-0 rounded-full bg-lime px-3.5 py-2 text-[12.5px] font-bold">getty ↗</span>
        </a>
      )}
    </div>
  )
}
