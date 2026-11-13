import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUpRight, ChatsCircle, CheckCircle, CircleNotch, MagnifyingGlass, MapPin, Plus, ShareNetwork, Sparkle, Ticket, X } from "@phosphor-icons/react"
import { cachedJson } from "../lib/cached"
import { t, LANG } from "../lib/i18n"
import { cityChip } from "../lib/cities"
import CityNow from "../components/CityNow"
import HostEvent from "../components/HostEvent"
import PerkCard from "../components/PerkCard"

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
const PAGE = 20
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

// one event as a list row, luma style: time, what, where, who, art on the right
function Row({ e, tz, onOpen }) {
  return (
    <motion.button
      layout="position"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpen(e)}
      className="flex w-full items-start gap-3 rounded-[1.3rem] bg-white/80 p-3 text-left shadow-[0_1px_2px_rgba(58,50,44,0.05)] backdrop-blur active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-ink-soft">
          {timeOf(e.startsAt, tz)}
          {priceOf(e) && <span className="rounded-full bg-cream-deep px-1.5 py-px text-[10.5px]">{priceOf(e)}</span>}
          {e.going && <span className="flex items-center gap-0.5 rounded-full bg-lime px-1.5 py-px text-[10.5px] text-ink"><CheckCircle size={10} weight="fill" /> {t("going")}</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[15px] font-bold leading-snug">{e.title}</span>
        {(e.venue || e.host) && <span className="mt-0.5 block truncate text-[12.5px] text-ink-soft">{e.venue || e.host}</span>}
        {e.goingCount > 0 && <span className="mt-1.5 block"><Faces e={e} size={20} /></span>}
      </span>
      <Thumb e={e} className="h-[72px] w-[72px] rounded-[0.9rem]" />
    </motion.button>
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

export default function Events({ token, me, city: cityProp, onOpenRoom, onCityMoved }) {
  const city = cityProp || me?.city || "medellin"
  const tz = TZ[city]
  const [data, setData] = useState(null)
  const [kind, setKind] = useState(() => { try { return localStorage.getItem("ev-kind") } catch { return null } })
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  const [whereOpen, setWhereOpen] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [q, setQ] = useState("")
  const [search, setSearch] = useState(null) // { q, reply, ids } | { q, loading } | { q, error }
  const inputRef = useRef(null)
  const [hostOpen, setHostOpen] = useState(false)
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
    await fetch("/api/event-host", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, action: "hide", id: e.id }) }).catch(() => {})
    setOpen(null)
    load()
  }

  const load = () => fetch(`/api/events?t=${token}&city=${city}&lang=${LANG}`).then((r) => r.json()).then(setData).catch(() => {})
  useEffect(() => {
    setData(null); setSearch(null); setShown(PAGE)
    cachedJson(`/api/events?t=${token}&city=${city}&lang=${LANG}`, setData)
  }, [token, city])

  const events = useMemo(() => data?.events || [], [data])
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])
  const todayKey = dayKey(new Date().toISOString(), tz)
  const tomorrowKey = dayKey(new Date(Date.now() + 864e5).toISOString(), tz)
  const kinds = KINDS.filter(([k]) => events.some((e) => e.category === k))
  const mine = events.filter((e) => e.going)
  const kindOn = kinds.some(([k]) => k === kind) ? kind : null

  const list = search?.ids ? search.ids.map((id) => byId.get(id)).filter(Boolean) : events.filter((e) => !kindOn || e.category === kindOn)
  const visible = search?.ids ? list : list.slice(0, shown)
  const groups = useMemo(() => {
    if (search?.ids) return [{ key: "results", items: visible }]
    const g = []
    for (const e of visible) {
      const k = dayKey(new Date(Math.max(Date.parse(e.startsAt), Date.now())).toISOString(), tz)
      if (!g.length || g[g.length - 1].key !== k) g.push({ key: k, items: [] })
      g[g.length - 1].items.push(e)
    }
    return g
  }, [visible, search, tz])

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
    setSearch({ q: query, reply: r.reply, ids: r.ids || [] })
  }
  const pickKind = (k) => {
    setKind(k); setShown(PAGE)
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
  const chat = (e) => { setOpen(null); onOpenRoom?.({ channel: e.channel, title: e.title }) }

  return (
    <div className="relative px-4 pb-28 pt-4">
      <p className="flex items-center gap-1 text-[12px] font-semibold text-ink-soft">
        <span>{t("what's on in")}</span>
        <button onClick={() => setWhereOpen(true)} className="flex items-center gap-1 rounded-full border border-line bg-white/70 px-2 py-0.5 font-bold text-ink active:scale-95">
          {cityChip(city).emoji} {String(cityChip(city).name || city).toLowerCase()} <span aria-hidden className="text-[10px]">▾</span>
        </button>
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <h2 className="display text-[34px] font-bold leading-[0.95] tracking-tight">{t("find your people")}</h2>
        {canHost && (
          <button onClick={() => setHostOpen(true)} className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-bold text-cream active:scale-95">
            <Plus size={13} weight="bold" /> {t("host")}
          </button>
        )}
      </div>
      <HostEvent token={token} city={city} open={hostOpen} onClose={() => setHostOpen(false)} onCreated={async (id) => { setHostOpen(false); await load(); window.dispatchEvent(new CustomEvent("irl:open-event", { detail: id })) }} />
      <CityNow token={token} city={city} open={whereOpen} onClose={() => setWhereOpen(false)} onMoved={onCityMoved} />

      {/* one row: what you're into. filters instantly, remembered for next time */}
      {!search && kinds.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
          {kinds.map(([k, emoji, label]) => (
            <button key={k} onClick={() => pickKind(kindOn === k ? null : k)} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold active:scale-95 ${kindOn === k ? "bg-ink text-cream" : "bg-white/70 text-ink-soft"}`}>
              {emoji} {t(label)}
            </button>
          ))}
        </div>
      )}

      {/* ask, don't scroll */}
      <form onSubmit={(ev) => { ev.preventDefault(); ask() }} className="mt-3 flex items-center gap-2 rounded-full bg-white px-4 py-1.5 shadow-[0_1px_2px_rgba(58,50,44,0.06),0_10px_28px_-16px_rgba(58,50,44,0.35)] focus-within:ring-2 focus-within:ring-lime-deep">
        <Sparkle size={18} weight="fill" className="shrink-0 text-lime-deep" />
        <input
          ref={inputRef}
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          enterKeyHint="search"
          placeholder={t("or ask: football, techno tonight, a run club")}
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/55"
        />
        {search || q ? (
          <button type="button" onClick={clear} aria-label={t("clear")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-deep"><X size={14} weight="bold" /></button>
        ) : (
          <button type="submit" aria-label={t("search")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-cream"><MagnifyingGlass size={15} weight="bold" /></button>
        )}
      </form>

      {search?.loading && (
        <div className="mt-6 flex items-center gap-3 rounded-[1.3rem] bg-white/80 px-4 py-4">
          <CircleNotch size={20} className="animate-spin text-lime-deep" />
          <p className="text-[13.5px] font-semibold">{t("looking around")} {String(cityChip(city).name || city).toLowerCase()} {t("for")} “{search.q}”…</p>
        </div>
      )}
      {search?.error && <p className="mt-6 rounded-[1.3rem] bg-white/80 px-4 py-4 text-[13.5px] font-semibold">{search.error}</p>}
      {search?.ids && (
        <div className="mt-5">
          <p className="text-[12px] font-bold text-ink-soft">“{search.q}”</p>
          {search.reply && <p className="mt-0.5 text-[15px] font-semibold leading-snug">{search.reply}</p>}
          {!search.ids.length && <button onClick={clear} className="mt-3 text-[13px] font-bold underline underline-offset-2">{t("see everything this week")}</button>}
        </div>
      )}

      {!search && mine.length > 0 && (
        <div className="mt-5">
          <p className="text-[12px] font-bold text-ink-soft">{t("your plans")}</p>
          <div className="no-scrollbar -mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4">
            {mine.map((e) => (
              <button key={e.id} onClick={() => chat(e)} className="flex shrink-0 items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-sm active:scale-95">
                <Thumb e={e} className="h-8 w-8 rounded-full" />
                <span className="max-w-[150px] truncate text-[12.5px] font-bold">{e.title}</span>
                <ChatsCircle size={16} weight="fill" />
              </button>
            ))}
          </div>
        </div>
      )}

      {!data && <div className="mt-10 flex justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>}
      {data && !search && !events.length && <p className="mt-8 rounded-[1.3rem] bg-white/70 px-4 py-5 text-center text-[13.5px] text-ink-soft">{t("we're still filling this city. ask above and we'll look around.")}</p>}

      {!search?.loading && groups.map((g) => (
        <section key={g.key} className="mt-5">
          {g.key !== "results" && (
            <p className="mb-2 flex items-baseline gap-1.5">
              <span className="text-[15px] font-bold">{dayLabel(g.key, todayKey, tomorrowKey)}</span>
              <span className="text-[12.5px] text-ink-soft">{dayParts(g.key).wk}</span>
            </p>
          )}
          <div className="space-y-2">
            {g.items.map((e) => <Row key={e.id} e={e} tz={tz} onOpen={setOpen} />)}
          </div>
        </section>
      ))}
      {!search && list.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE)} className="mt-4 w-full rounded-full border border-line bg-white/60 py-3 text-[13.5px] font-bold">
          {t("show more")} · {list.length - shown}
        </button>
      )}

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

                {open.url && (
                  <a href={open.url} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-[13.5px] font-bold text-ink-soft">
                    {open.isFree ? t("rsvp on") : t("tickets on")} {open.source === "web" ? new URL(open.url).hostname.replace(/^www\./, "") : open.source} <ArrowUpRight size={14} />
                  </a>
                )}
                {(open.mine || (me?.isMod && open.hosted)) && (
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
