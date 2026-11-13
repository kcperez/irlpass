import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUpRight, CaretDown, ChatsCircle, CheckCircle, CircleNotch, MagnifyingGlass, MapPin, Plus, ShareNetwork, SlidersHorizontal, Sparkle, Ticket, X } from "@phosphor-icons/react"
import { cachedJson } from "../lib/cached"
import { t, LANG } from "../lib/i18n"
import { cityChip } from "../lib/cities"
import { haptic } from "../lib/haptic"
import CityNow from "../components/CityNow"
import HostEvent from "../components/HostEvent"
import PerkCard from "../components/PerkCard"
import AddEvent from "../components/AddEvent"

// events first: what's on in your city, found by asking ("football", "techno")
// instead of scrolling forever. going puts you in the event's group chat.
const KINDS = [
  ["run", "🏃", "run"],
  ["wellness", "🧘", "wellness"],
  ["party", "🪩", "music & party"],
  ["food", "🍷", "food & drink"],
  ["art", "🎨", "art"],
  ["social", "💬", "social"],
  ["tech", "💻", "tech"],
]
const TZ = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }
const dayKey = (iso, tz) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz })
const timeOf = (iso, tz) => new Date(iso).toLocaleTimeString([], { timeZone: tz, hour: "numeric", minute: "2-digit" }).toLowerCase().replace(":00", "").replace(/\s/g, "")
const dayParts = (key) => {
  const d = new Date(`${key}T12:00:00`)
  return { mon: d.toLocaleDateString([], { month: "short" }).toUpperCase().replace(".", ""), day: d.getDate(), wk: d.toLocaleDateString([], { weekday: "long" }).toLowerCase() }
}
const dayLabel = (key, todayKey, tomorrowKey) =>
  key === todayKey ? t("today") : key === tomorrowKey ? t("tomorrow") : new Date(`${key}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" }).toLowerCase()
const priceOf = (e) => (e.isFree ? t("free") : e.priceCents ? `${String(e.currency).toLowerCase() === "eur" ? "€" : "$"}${Math.round(e.priceCents / 100)}` : null)
const kindEmoji = (k) => (KINDS.find(([x]) => x === k) || [])[1] || "✨"

function Faces({ e, size = 22 }) {
  if (!e.goingCount) return null
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex -space-x-1.5">
        {e.faces.slice(0, 4).map((f) => (
          <span key={f.memberNo} style={{ width: size, height: size }} className="overflow-hidden rounded-full border-[1.5px] border-cream bg-lime">
            {f.photo && <img src={f.photo} alt="" className="h-full w-full object-cover" />}
          </span>
        ))}
      </span>
      <span className="text-[12px] font-bold">{e.goingCount} {t("going")}</span>
    </span>
  )
}

function Thumb({ e, className = "" }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-lime ${className}`}>
      <span className="absolute inset-0 flex items-center justify-center text-[22px]">{kindEmoji(e.category)}</span>
      {e.cover && <img src={e.cover} alt="" loading="lazy" onError={(x) => { x.currentTarget.style.display = "none" }} className="relative h-full w-full object-cover" />}
    </span>
  )
}

function GoingButton({ e, busy, onToggle }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={busy || (!e.going && e.spotsLeft === 0)}
      onClick={() => onToggle(e)}
      className={`flex w-full items-center justify-center gap-1.5 rounded-full py-3.5 text-[15px] font-bold ${e.going ? "bg-lime text-ink" : "bg-ink text-cream"}`}
    >
      {busy ? <CircleNotch size={16} className="animate-spin" /> : e.going ? <CheckCircle size={17} weight="fill" /> : e.hosted && e.priceCents ? <Ticket size={17} weight="fill" /> : null}
      {e.going ? t("you're going") : e.spotsLeft === 0 ? t("it's full") : e.hosted && e.priceCents ? `${t("get a ticket")} · ${priceOf(e)}` : t("i'm going")}
    </motion.button>
  )
}

// film grain over every card, like a photo, not a screen
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.55'/></svg>\")"
const DOT = { run: "#cdee45", wellness: "#a7e3c4", party: "#ff7ad9", food: "#f6a76b", art: "#9fb4ff", social: "#ddd0f6", tech: "#7fe0ff" }
// no cover: a mood made from the category color, never a broken image
const MOOD = { run: ["#3d4a12", "#cdee45"], wellness: ["#1f4636", "#a7e3c4"], party: ["#4a1240", "#ff7ad9"], food: ["#4f2a12", "#f6a76b"], art: ["#1d2a5c", "#9fb4ff"], social: ["#3a2f52", "#ddd0f6"], tech: ["#0f3a46", "#7fe0ff"] }

// one event per screen: the cover floats on its own blur, the facts sit on frosted glass
const spring = { type: "spring", stiffness: 260, damping: 26 }

function Card({ e, tz, near, active, alt, first, todayKey, tomorrowKey, busy, onOpen, onToggle, onShare, onChat, copied }) {
  const [broken, setBroken] = useState(false)
  // tap opens it, double tap says you're going (with a little burst), like a like
  const [burst, setBurst] = useState(0)
  const tapT = useRef(null)
  const tap = () => {
    if (tapT.current) {
      clearTimeout(tapT.current); tapT.current = null
      haptic("pop"); setBurst((n) => n + 1)
      if (!e.going) onToggle(e)
      return
    }
    tapT.current = setTimeout(() => { tapT.current = null; onOpen(e) }, 260)
  }
  useEffect(() => () => clearTimeout(tapT.current), [])
  const img = e.cover && !broken ? e.cover : null
  const [a, b] = MOOD[e.category] || MOOD.social
  const day = dayKey(new Date(Math.max(Date.parse(e.startsAt), Date.now())).toISOString(), tz)
  const glass = "border border-white/20 bg-white/15 text-white backdrop-blur-xl"
  return (
    <section className="relative h-full snap-start snap-always overflow-hidden">
      {/* backdrop: the cover blown up and blurred, or the category's mood */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(80% 60% at 30% 20%, ${b}55, transparent 70%), radial-gradient(70% 60% at 80% 80%, ${b}33, transparent 70%), ${a}` }} />
      {/* blur a quarter-size copy and scale it up: same look, a fraction of the gpu work */}
      {img && near && <img src={img} alt="" aria-hidden style={{ width: "25%", height: "25%", transform: "scale(5.2) translateZ(0)", transformOrigin: "0 0", filter: "blur(10px)" }} className="absolute left-0 top-0 object-cover opacity-70" />}
      <div className="absolute inset-0 opacity-[0.18] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80" />

      <div className="relative flex h-full flex-col">
      <button onClick={tap} className="relative flex min-h-0 flex-1 items-center justify-center px-8 pt-16 [touch-action:manipulation]">
        <motion.span animate={{ scale: active ? 1 : 0.9, rotate: active ? 0 : -2, opacity: active ? 1 : 0.6 }} transition={spring} style={{ width: "min(84%, 360px, 44vh)" }} className="block">
          {img ? (
            near && <img src={img} alt="" draggable={false} onError={() => setBroken(true)} className="aspect-square w-full rounded-[1.6rem] object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]" />
          ) : (
            <span className="flex aspect-square w-full items-center justify-center rounded-[1.6rem] border border-white/15 bg-white/10 text-[84px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">{kindEmoji(e.category)}</span>
          )}
        </motion.span>
        <AnimatePresence>
          {burst > 0 && (
            <motion.span key={burst} initial={{ scale: 0.2, opacity: 0, rotate: -18 }} animate={{ scale: [0.2, 1.25, 1], opacity: [0, 1, 1], rotate: [-18, 8, 0] }} exit={{ scale: 1.6, opacity: 0, y: -40 }}
              transition={{ duration: 0.45 }} onAnimationComplete={() => setTimeout(() => setBurst(0), 350)}
              className="pointer-events-none absolute text-[110px] drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]">🙌</motion.span>
          )}
        </AnimatePresence>
      </button>

      <motion.div initial={false} animate={{ opacity: active ? 1 : 0, y: active ? 0 : 28 }} transition={{ ...spring, delay: active ? 0.05 : 0 }} className="px-5 pb-5 text-white">
        {alt && <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink"><Sparkle size={11} weight="fill" /> {t("close to")} “{alt}”</span>}
        <button onClick={() => onOpen(e)} className="block w-full text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em]">
            <span className="h-2 w-2 rounded-full" style={{ background: DOT[e.category] || "#ddd0f6" }} />
            {dayLabel(day, todayKey, tomorrowKey)} · {timeOf(e.startsAt, tz)}{priceOf(e) ? ` · ${priceOf(e)}` : ""}
          </span>
          <span className="serif-display mt-2.5 line-clamp-3 block text-[34px] leading-[1.02]">{e.title}</span>
          {(e.venue || e.host) && <span className="mt-1 block truncate text-[14px] text-white/70">{e.venue || e.host}</span>}
          {e.perk && <span className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold ${glass}`}>🎁 {e.perk.item} {t("for a story")}</span>}
        </button>
        <div className="mt-3 flex items-center gap-2">
          {e.goingCount > 0 ? (
            <span className="flex -space-x-2">
              {e.faces.slice(0, 3).map((f) => (
                <span key={f.memberNo} className="h-8 w-8 overflow-hidden rounded-full border-2 border-white/80 bg-lime">{f.photo && <img src={f.photo} alt="" className="h-full w-full object-cover" />}</span>
              ))}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/80">
            {e.goingCount ? `${e.goingCount} ${t("going")}` : t("go first, the chat is yours")}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={busy || (!e.going && e.spotsLeft === 0)}
            onClick={() => { haptic(e.going ? "soft" : "pop"); e.going ? onChat(e) : onToggle(e) }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-3.5 text-[15px] font-bold ${e.going ? "bg-lime text-ink" : "bg-white text-ink"}`}
          >
            {busy ? <CircleNotch size={16} className="animate-spin" /> : e.going ? <ChatsCircle size={17} weight="fill" /> : e.hosted && e.priceCents ? <Ticket size={17} weight="fill" /> : null}
            {e.going ? t("open the group chat") : e.spotsLeft === 0 ? t("it's full") : e.hosted && e.priceCents ? `${t("get a ticket")} · ${priceOf(e)}` : t("i'm going")}
          </motion.button>
          <button onClick={() => onShare(e)} aria-label={t("share")} className={`flex h-[50px] w-[50px] items-center justify-center rounded-full ${glass}`}>
            {copied ? <CheckCircle size={19} weight="fill" /> : <ShareNetwork size={19} weight="bold" />}
          </button>
        </div>
        {first && <p className="mt-3 text-center text-[11.5px] font-semibold text-white/50">{t("swipe up for more · double tap to go · left or right to change the vibe")}</p>}
      </motion.div>
      </div>
    </section>
  )
}

export default function Events({ token, me, city: cityProp, onOpenRoom, onCityMoved, onProfile, profileDot }) {
  const city = cityProp || me?.city || "medellin"
  const tz = TZ[city]
  const [data, setData] = useState(null)
  const [kind, setKind] = useState(() => { try { return localStorage.getItem("ev-kind") } catch { return null } })
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  const [whereOpen, setWhereOpen] = useState(false)
  const [q, setQ] = useState("")
  const [search, setSearch] = useState(null) // { q, reply, ids } | { q, loading } | { q, error }
  const inputRef = useRef(null)
  const [hostOpen, setHostOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const canHost = !!(me?.canHost || me?.isMod)
  // a shared link to a paid event opens its sheet (club sends this)
  useEffect(() => {
    const onOpen = (ev) => {
      const id = Number(ev.detail)
      fetch(`/api/events?t=${token}&id=${id}&lang=${LANG}`).then((r) => r.json()).then((r) => r?.event && setOpen(r.event)).catch(() => {})
    }
    window.addEventListener("irl:open-event", onOpen)
    return () => window.removeEventListener("irl:open-event", onOpen)
  }, [token])
  const takeDown = async (e) => {
    const added = !e.hosted
    await fetch(added ? "/api/event-submit" : "/api/event-host", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, action: added ? "remove" : "hide", id: e.id }) }).catch(() => {})
    setOpen(null)
    load()
  }

  const load = () => fetch(`/api/events?t=${token}&city=${city}&lang=${LANG}`).then((r) => r.json()).then(setData).catch(() => {})
  useEffect(() => {
    setData(null); setSearch(null)
    cachedJson(`/api/events?t=${token}&city=${city}&lang=${LANG}`, setData)
  }, [token, city])

  const events = useMemo(() => data?.events || [], [data])
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])
  const todayKey = dayKey(new Date().toISOString(), tz)
  const tomorrowKey = dayKey(new Date(Date.now() + 864e5).toISOString(), tz)
  const kinds = KINDS.filter(([k]) => events.some((e) => e.category === k))
  const mine = events.filter((e) => e.going)
  const kindOn = kinds.some(([k]) => k === kind) ? kind : null

  const list = search?.ids ? [...search.ids, ...(search.near || [])].map((id) => byId.get(id)).filter(Boolean) : events.filter((e) => !kindOn || e.category === kindOn)
  const isNear = (id) => !!search?.near?.includes(id) && !search.ids.includes(id)
  const ask = async (text) => {
    const query = String(text ?? q).trim()
    if (query.length < 2) return
    setQ(query)
    inputRef.current?.blur()
    setSearch({ q: query, loading: true })
    const r = await fetch("/api/event-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, city, q: query }),
    }).then((x) => x.json()).catch(() => ({ error: t("search is down for a sec. try again.") }))
    if (r.error) return setSearch({ q: query, error: r.error })
    // the web may have added new listings: reload so they show up with going buttons
    await load()
    haptic("soft")
    setSearch({ q: query, reply: r.reply, ids: r.ids || [], near: r.near || [] })
    feedRef.current?.scrollTo({ top: 0 }); setIdx(0)
  }
  const pickKind = (k) => {
    setKind(k)
    try { k ? localStorage.setItem("ev-kind", k) : localStorage.removeItem("ev-kind") } catch {}
  }
  const clear = () => { setSearch(null); setQ("") }

  const toggle = async (e) => {
    setBusy(e.id)
    if (!e.going && e.hosted && e.priceCents) {
      let via = ""
      try { via = localStorage.getItem("irl:ref") || "" } catch { /* private mode */ }
      const r = await fetch("/api/event-host", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, action: "ticket", id: e.id, via }),
      }).then((x) => x.json()).catch(() => null)
      if (r?.url) { window.location.href = r.url; return }
      setBusy(null)
      return
    }
    const r = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, id: e.id, going: !e.going, lang: LANG }),
    }).then((x) => x.json()).catch(() => null)
    setBusy(null)
    if (!r?.event) return
    setData((d) => ({ ...d, events: d.events.map((x) => (x.id === e.id ? r.event : x)) }))
    if (open?.id === e.id) setOpen(r.event)
  }
  // the way in for everyone not on irlpass yet: a public page for the event that
  // drops them in this chat after signup, credited to you
  const share = async (e) => {
    const url = `https://irlpass.xyz/e/${e.id}${me?.memberNo ? `?ref=${me.memberNo}` : ""}`
    const text = `${e.title}: ${t("who's going? join the group chat")}`
    try {
      if (navigator.share) await navigator.share({ title: e.title, text, url })
      else { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(e.id) }
    } catch { /* closed the share sheet */ }
  }
  const [copied, setCopied] = useState(null)
  // the two-line "what is this", written the first time anyone opens the event
  const [abouts, setAbouts] = useState({})
  useEffect(() => {
    if (!open || open.about || open.hosted || abouts[open.id] !== undefined) return
    setAbouts((a) => ({ ...a, [open.id]: null }))
    fetch(`/api/event-about?t=${token}&id=${open.id}`).then((r) => r.json())
      .then((r) => setAbouts((a) => ({ ...a, [open.id]: r?.about ? r.about[LANG] || r.about.en : "" })))
      .catch(() => setAbouts((a) => ({ ...a, [open.id]: "" })))
  }, [open, token]) // eslint-disable-line react-hooks/exhaustive-deps
  const SOURCE = { ra: "resident advisor", luma: "luma", eventbrite: "eventbrite" }
  const chat = (e) => { setOpen(null); onOpenRoom?.({ channel: e.channel, title: e.title }) }

  // the feed: one event per screen, swipe up for the next, left/right to change vibe
  const feedRef = useRef(null)
  const [idx, setIdx] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [kindOpen, setKindOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const touch = useRef(null)
  const order = [null, ...kinds.map(([k]) => k)]
  const kindName = (k) => (k ? `${kindEmoji(k)} ${t((KINDS.find(([x]) => x === k) || [])[2])}` : `✨ ${t("all vibes")}`)
  const countOf = (k) => (k ? events.filter((e) => e.category === k).length : events.length)
  const [dir, setDir] = useState(0)
  const switchKind = (k, d = 0) => {
    haptic()
    setDir(d); pickKind(k); clear(); setKindOpen(false)
    setFlash(kindName(k)); setTimeout(() => setFlash(null), 900)
    feedRef.current?.scrollTo({ top: 0 }); setIdx(0)
  }
  const onFeedScroll = (ev) => {
    const el = ev.currentTarget
    const i = Math.round(el.scrollTop / Math.max(1, el.clientHeight))
    if (i !== idx) { setIdx(i); haptic("soft") }
  }
  const onTouchStart = (ev) => { const p = ev.touches[0]; touch.current = { x: p.clientX, y: p.clientY } }
  const onTouchEnd = (ev) => {
    const s0 = touch.current; touch.current = null
    if (!s0 || search) return
    const p = ev.changedTouches[0]
    const dx = p.clientX - s0.x, dy = p.clientY - s0.y
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || order.length < 2) return
    const at = order.indexOf(kindOn)
    switchKind(order[(at + (dx < 0 ? 1 : -1) + order.length) % order.length], dx < 0 ? 1 : -1)
  }
  const feed = list
  const glass = "border border-white/20 bg-white/15 text-white backdrop-blur-xl"

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#15110f]">
      <AddEvent token={token} city={city} open={addOpen} canHost={canHost} onClose={() => setAddOpen(false)} onHost={() => { setAddOpen(false); setHostOpen(true) }} onAdded={async (id) => { setAddOpen(false); await load(); window.dispatchEvent(new CustomEvent("irl:open-event", { detail: id })) }} />
      <HostEvent token={token} city={city} open={hostOpen} onClose={() => setHostOpen(false)} onCreated={async (id) => { setHostOpen(false); await load(); window.dispatchEvent(new CustomEvent("irl:open-event", { detail: id })) }} />
      <CityNow token={token} city={city} open={whereOpen} onClose={() => setWhereOpen(false)} onMoved={onCityMoved} />

      <motion.div
        key={`${kindOn || "all"}-${search?.q || ""}`}
        ref={feedRef}
        initial={dir ? { x: `${dir * 40}%`, opacity: 0 } : { opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        onScroll={onFeedScroll}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="no-scrollbar absolute inset-0 snap-y snap-mandatory overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        {!search?.loading && feed.map((e, i) => (
          <Card key={e.id} e={e} tz={tz} near={Math.abs(i - idx) <= 1} active={i === idx} alt={isNear(e.id) ? search.q : ""} first={i === 0 && !search} todayKey={todayKey} tomorrowKey={tomorrowKey}
            busy={busy === e.id} onOpen={setOpen} onToggle={toggle} onShare={share} onChat={chat} copied={copied === e.id} />
        ))}
        {data && !search?.loading && (
          <section className="relative flex h-full snap-start flex-col items-center justify-center px-8 text-center text-white">
            <p className="serif-display text-[34px] leading-[1.05]">{feed.length ? t("that's everything") : t("nothing here yet")}</p>
            <p className="mt-2 text-[14px] text-white/60">{t("ask for something and we'll look around")} {String(cityChip(city).name || city).toLowerCase()}.</p>
            <button onClick={() => setSearchOpen(true)} className={`mt-6 flex items-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-bold ${glass}`}><Sparkle size={16} weight="fill" /> {t("ask")}</button>
            <button onClick={() => setAddOpen(true)} className="mt-3 text-[13px] font-bold text-white/60 underline underline-offset-4">{t("know something good? add it")}</button>
          </section>
        )}
      </motion.div>

      {/* frosted top bar: where, what, ask, add */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/45 to-transparent px-3 pb-8 pt-3">
        {searchOpen ? (
          <form onSubmit={(ev) => { ev.preventDefault(); setSearchOpen(false); ask() }} className={`pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-4 pr-1 ${glass}`}>
            <Sparkle size={16} weight="fill" className="shrink-0" />
            <input ref={inputRef} autoFocus value={q} onChange={(ev) => setQ(ev.target.value)} enterKeyHint="search" placeholder={t("football, techno tonight, a run club")} className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold text-white outline-none placeholder:text-white/50" />
            <button type="button" onClick={() => { setSearchOpen(false); if (!search) setQ("") }} aria-label={t("close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15"><X size={15} weight="bold" /></button>
          </form>
        ) : (
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button onClick={() => setWhereOpen(true)} className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-bold ${glass}`}>
              {cityChip(city).emoji} {String(cityChip(city).name || city).toLowerCase()}
            </button>
            <button onClick={() => { haptic("soft"); setKindOpen((x) => !x) }} aria-label={t("pick a vibe")} className={`flex min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold ${glass}`}>
              <SlidersHorizontal size={14} weight="bold" className="shrink-0" />
              <span className="truncate">{search ? `“${search.q}”` : kindName(kindOn)}</span>
              <CaretDown size={11} weight="bold" className={`shrink-0 opacity-70 transition-transform ${kindOpen ? "rotate-180" : ""}`} />
            </button>
            <span className="flex-1" />
            {mine.length > 0 && (
              <button onClick={() => setPlansOpen((x) => !x)} aria-label={t("your plans")} className={`relative flex h-10 w-10 items-center justify-center rounded-full ${glass}`}>
                <ChatsCircle size={18} weight="fill" />
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 text-[10px] font-bold text-ink">{mine.length}</span>
              </button>
            )}
            <button onClick={() => setSearchOpen(true)} aria-label={t("search")} className={`flex h-10 w-10 items-center justify-center rounded-full ${glass}`}><MagnifyingGlass size={17} weight="bold" /></button>
            <button onClick={() => setAddOpen(true)} aria-label={t("add")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink"><Plus size={17} weight="bold" /></button>
            {onProfile && (
              <button onClick={onProfile} aria-label={t("you")} className="relative h-10 w-10 overflow-hidden rounded-full border border-white/30 bg-white/15">
                {me?.photo && <img src={me.photo} alt="" className="h-full w-full object-cover" />}
                {profileDot && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[#c4453d]" />}
              </button>
            )}
          </div>
        )}

        <AnimatePresence>
          {kindOpen && !searchOpen && (
            <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={spring} style={{ transformOrigin: "top left" }} className={`pointer-events-auto mt-2 w-64 overflow-hidden rounded-[1.3rem] p-1.5 ${glass} bg-black/45`}>
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">{t("what are you into?")}</p>
              {order.map((k) => (
                <button key={k || "all"} onClick={() => switchKind(k)} className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-left text-[14px] font-bold ${kindOn === k && !search ? "bg-white text-ink" : ""}`}>
                  <span>{kindName(k)}</span><span className="text-[12px] opacity-60">{countOf(k)}</span>
                </button>
              ))}
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-white/50">{t("or swipe left and right on the feed")}</p>
            </motion.div>
          )}
          {plansOpen && !searchOpen && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={`pointer-events-auto ml-auto mt-2 w-64 overflow-hidden rounded-[1.3rem] p-1.5 ${glass} bg-black/40`}>
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">{t("your plans")}</p>
              {mine.map((e) => (
                <button key={e.id} onClick={() => { setPlansOpen(false); chat(e) }} className="flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left">
                  <Thumb e={e} className="h-8 w-8 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{e.title}</span>
                  <ChatsCircle size={16} weight="fill" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {search?.ids && !searchOpen && (
          <div className={`pointer-events-auto mt-2 flex items-start gap-2 rounded-[1.3rem] px-4 py-3 ${glass} bg-black/35`}>
            <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{search.reply || t("here's what we found")}</p>
            <button onClick={clear} aria-label={t("clear")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15"><X size={13} weight="bold" /></button>
          </div>
        )}
        {search?.error && !searchOpen && (
          <div className={`pointer-events-auto mt-2 flex items-start gap-2 rounded-[1.3rem] px-4 py-3 ${glass} bg-black/35`}>
            <p className="min-w-0 flex-1 text-[14px] font-semibold">{search.error}</p>
            <button onClick={clear} aria-label={t("clear")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15"><X size={13} weight="bold" /></button>
          </div>
        )}
      </div>

      {(!data || search?.loading) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-10 text-center text-white">
          <CircleNotch size={24} className="animate-spin text-white/70" />
          {search?.loading && <p className="serif-display text-[24px] leading-tight">{t("looking around")} {String(cityChip(city).name || city).toLowerCase()} {t("for")} “{search.q}”</p>}
        </div>
      )}

      <AnimatePresence>
        {flash && (
          <motion.p key={flash} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 text-center">
            <span className="display inline-block rounded-full bg-white px-5 py-2.5 text-[22px] text-ink shadow-2xl">{flash}</span>
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 32 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(ev, info) => { if (info.offset.y > 110 || info.velocity.y > 600) setOpen(null) }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90vh] max-w-[460px] overflow-y-auto overflow-x-hidden rounded-t-[2rem] bg-cream pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
            >
              {/* the cover, blurred into the sheet: the event sets the mood */}
              <div className="relative">
                {open.cover && <img src={open.cover} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl" />}
                <div className="absolute inset-0 bg-gradient-to-b from-cream/10 via-cream/40 to-cream" />
                <div className="relative mx-auto h-1.5 w-11 translate-y-3 rounded-full bg-ink/20" />
                <button onClick={() => setOpen(null)} aria-label={t("close")} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur"><X size={16} weight="bold" /></button>
                <div className="relative px-5 pb-1 pt-9">
                  <Thumb e={open} className="mx-auto aspect-square w-[62%] rounded-[1.4rem] shadow-[0_24px_50px_-18px_rgba(58,50,44,0.55)]" />
                  <h2 className="display mt-5 text-[26px] font-bold leading-[1.08] tracking-tight">{open.title}</h2>
                  {open.host && <p className="mt-1 text-[13px] font-semibold text-ink-soft">{t("by")} {open.host}</p>}
                  {!open.hosted && (open.about || abouts[open.id]) ? (
                    <p className="mt-3 text-[15px] leading-snug">{open.about || abouts[open.id]}</p>
                  ) : !open.hosted && abouts[open.id] === null ? (
                    <span className="mt-3 block space-y-2" aria-label={t("loading")}>
                      <span className="block h-3.5 w-full animate-pulse rounded-full bg-ink/10" />
                      <span className="block h-3.5 w-4/5 animate-pulse rounded-full bg-ink/10" />
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="px-5">
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center overflow-hidden rounded-[0.8rem] border border-line bg-white">
                    <span className="w-full bg-cream-deep text-center text-[9px] font-bold leading-[14px] text-ink-soft">{dayParts(dayKey(open.startsAt, tz)).mon}</span>
                    <span className="text-[16px] font-bold leading-none">{dayParts(dayKey(open.startsAt, tz)).day}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold">{dayLabel(dayKey(open.startsAt, tz), todayKey, tomorrowKey)}, {dayParts(dayKey(open.startsAt, tz)).wk}</span>
                    <span className="block text-[13px] text-ink-soft">{timeOf(open.startsAt, tz)}{open.endsAt && timeOf(open.endsAt, tz) !== timeOf(open.startsAt, tz) ? ` – ${timeOf(open.endsAt, tz)}` : ""}</span>
                  </span>
                </div>
                {(open.venue || open.address) && (
                  <a
                    href={open.lat ? `https://maps.google.com/?q=${open.lat},${open.lng}` : `https://maps.google.com/?q=${encodeURIComponent([open.venue, open.address].filter(Boolean).join(" "))}`}
                    target="_blank" rel="noreferrer"
                    className="mt-3 flex items-center gap-3"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.8rem] border border-line bg-white"><MapPin size={19} weight="fill" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[14.5px] font-bold"><span className="truncate">{open.venue || open.address}</span> <ArrowUpRight size={13} className="shrink-0" /></span>
                      {open.venue && open.address && open.address !== open.venue && <span className="block truncate text-[13px] text-ink-soft">{open.address}</span>}
                    </span>
                  </a>
                )}

                {open.url && !open.hosted && (
                  <a href={open.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.8rem] bg-lime"><Ticket size={19} weight="fill" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[14.5px] font-bold">{open.isFree ? t("rsvp on") : t("tickets on")} {open.source === "web" ? new URL(open.url).hostname.replace(/^www\./, "") : SOURCE[open.source] || open.source} <ArrowUpRight size={13} className="shrink-0" /></span>
                      <span className="block text-[13px] text-ink-soft">{priceOf(open) ? `${priceOf(open)} · ` : ""}{t("then tap i'm going here to meet people")}</span>
                    </span>
                  </a>
                )}

                {open.hosted && (
                  <div className="mt-4">
                    <p className="inline-flex items-center gap-1 rounded-full bg-lime px-2.5 py-1 text-[11.5px] font-bold">✦ {t("hosted on irlpass")}{open.host ? ` · ${String(open.host).split(/\s+/)[0].toLowerCase()}` : ""}</p>
                    {open.details && <p className="mt-2 whitespace-pre-line text-[14px] leading-snug">{open.details}</p>}
                  </div>
                )}

                {open.perk && <PerkCard token={token} e={open} me={me} />}

                {/* the "get in" card */}
                <div className="mt-5 overflow-hidden rounded-[1.4rem] border border-white/70 bg-white/70 shadow-[0_10px_30px_-18px_rgba(58,50,44,0.4)] backdrop-blur">
                  <p className="border-b border-line/70 bg-white/60 px-4 py-2 text-[12px] font-bold text-ink-soft">{t("who's going")}</p>
                  <div className="px-4 py-3.5">
                    {open.goingCount ? <Faces e={open} size={28} /> : <p className="text-[13.5px] font-semibold">{t("nobody from irlpass yet. go first and the chat is yours.")}</p>}
                    {open.spotsLeft != null && open.spotsLeft > 0 && <p className="mt-2 text-[12.5px] font-bold text-ink-soft">{open.spotsLeft} {t("spots left")}</p>}
                    {priceOf(open) && (
                      <p className="mt-3 text-[12px] font-bold text-ink-soft">{t("entry")} <span className="ml-1 text-[18px] text-ink">{priceOf(open)}</span></p>
                    )}
                    <div className="mt-3 space-y-2">
                      <GoingButton e={open} busy={busy === open.id} onToggle={toggle} />
                      {open.going && (
                        <button onClick={() => chat(open)} className="flex w-full items-center justify-center gap-2 rounded-full border border-ink py-3 text-[14.5px] font-bold">
                          <ChatsCircle size={18} weight="fill" /> {t("open the group chat")}
                        </button>
                      )}
                      <button onClick={() => share(open)} className="flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-[14.5px] font-bold">
                        <ShareNetwork size={18} weight="bold" /> {copied === open.id ? t("link copied") : t("bring people: share the chat")}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="h-3" />
                {open.addedBy && !open.hosted && <p className="pb-2 text-center text-[12px] text-ink-soft">{t("added by")} {open.addedBy}</p>}
                {(open.mine || open.mineAdded || (me?.isMod && (open.hosted || open.addedBy))) && (
                  <button onClick={() => takeDown(open)} className="block w-full pb-2 text-center text-[12px] font-bold text-red-600">{t("take it down")}</button>
                )}
                {!open.claimed && !open.hosted && (
                  <a href={`mailto:hello@irlpass.xyz?subject=${encodeURIComponent(`claim: ${open.title} (#${open.id})`)}`} className="block pb-2 text-center text-[12px] text-ink-soft">
                    {t("is this your event? claim it")}
                  </a>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
