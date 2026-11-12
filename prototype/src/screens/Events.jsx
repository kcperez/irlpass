import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUpRight, ChatsCircle, CheckCircle, CircleNotch, MapPin, X } from "@phosphor-icons/react"
import { cachedJson } from "../lib/cached"
import { t } from "../lib/i18n"
import { cityChip } from "../lib/cities"
import CityNow from "../components/CityNow"

// events first: what's on in your city this week, who from irlpass is going,
// and one tap into each event's group chat.
const KINDS = [
  ["all", "✨", "everything"],
  ["run", "🏃", "run"],
  ["wellness", "🧘", "wellness"],
  ["party", "🪩", "party"],
  ["music", "🎶", "music"],
  ["food", "🍝", "food"],
  ["art", "🎨", "art"],
  ["social", "💬", "social"],
  ["tech", "💻", "tech"],
]
const TZ = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }
const dayKey = (iso, tz) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz })
const timeOf = (iso, tz) => new Date(iso).toLocaleTimeString([], { timeZone: tz, hour: "numeric", minute: "2-digit" }).toLowerCase().replace(":00", "").replace(/\s/g, "")
const dayLabel = (key, todayKey, tomorrowKey) =>
  key === todayKey ? t("today") : key === tomorrowKey ? t("tomorrow") : new Date(`${key}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" }).toLowerCase()
const priceOf = (e) => (e.isFree ? t("free") : e.priceCents ? `${e.currency === "eur" || e.currency === "EUR" ? "€" : "$"}${Math.round(e.priceCents / 100)}` : null)

function Faces({ e, size = 26 }) {
  if (!e.goingCount) return null
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex -space-x-2">
        {e.faces.slice(0, 4).map((f) => (
          <span key={f.memberNo} style={{ width: size, height: size }} className="overflow-hidden rounded-full border-2 border-white bg-cream-deep">
            {f.photo && <img src={f.photo} alt="" className="h-full w-full object-cover" />}
          </span>
        ))}
      </span>
      <span className="text-[12.5px] font-bold">{e.goingCount} {t("going")}</span>
    </span>
  )
}

function GoingButton({ e, busy, onToggle, big = false }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      disabled={busy}
      onClick={(ev) => { ev.stopPropagation(); onToggle(e) }}
      className={`flex shrink-0 items-center justify-center gap-1.5 rounded-full font-bold ${big ? "w-full py-3.5 text-[15px]" : "px-4 py-2 text-[13px]"} ${e.going ? "bg-lime text-ink" : "bg-ink text-cream"}`}
    >
      {busy ? <CircleNotch size={15} className="animate-spin" /> : e.going ? <CheckCircle size={16} weight="fill" /> : null}
      {e.going ? t("you're going") : t("i'm going")}
    </motion.button>
  )
}

export default function Events({ token, me, city: cityProp, onOpenRoom, onCityMoved }) {
  const city = cityProp || me?.city || "medellin"
  const tz = TZ[city]
  const [data, setData] = useState(null)
  const [kind, setKind] = useState("all")
  const [day, setDay] = useState("all")
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  const [whereOpen, setWhereOpen] = useState(false)

  useEffect(() => {
    setData(null)
    cachedJson(`/api/events?t=${token}&city=${city}`, setData)
  }, [token, city])

  const events = useMemo(() => data?.events || [], [data])
  const todayKey = dayKey(new Date().toISOString(), tz)
  const tomorrowKey = dayKey(new Date(Date.now() + 864e5).toISOString(), tz)
  const days = useMemo(() => [...new Set(events.map((e) => dayKey(e.startsAt, tz)))].slice(0, 10), [events, tz])
  const kinds = KINDS.filter(([k]) => k === "all" || events.some((e) => e.category === k))
  const mine = events.filter((e) => e.going)
  const shown = events.filter((e) => (kind === "all" || e.category === kind) && (day === "all" || dayKey(e.startsAt, tz) === day))

  const toggle = async (e) => {
    setBusy(e.id)
    const r = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, id: e.id, going: !e.going }),
    }).then((x) => x.json()).catch(() => null)
    setBusy(null)
    if (!r?.event) return
    setData((d) => ({ ...d, events: d.events.map((x) => (x.id === e.id ? r.event : x)) }))
    if (open?.id === e.id) setOpen(r.event)
  }
  const chat = (e) => { setOpen(null); onOpenRoom?.({ channel: e.channel, title: e.title }) }

  return (
    <div className="relative px-4 pb-28 pt-4">
      <p className="flex items-center gap-1 text-[12px] font-semibold text-ink-soft">
        <span>{t("what's on")} ·</span>
        <button onClick={() => setWhereOpen(true)} className="flex items-center gap-1 rounded-full border border-line bg-white/70 px-2 py-0.5 font-bold text-ink active:scale-95">
          {cityChip(city).emoji} {String(cityChip(city).name || city).toLowerCase()} <span aria-hidden className="text-[10px]">▾</span>
        </button>
      </p>
      <h2 className="display mt-1 text-[34px] font-bold leading-[0.95] tracking-tight">{t("this week")}</h2>
      <p className="mt-1 text-[13px] text-ink-soft">{t("tap i'm going and you're in the group chat with everyone from irlpass going.")}</p>
      <CityNow token={token} city={city} open={whereOpen} onClose={() => setWhereOpen(false)} onMoved={onCityMoved} />

      {mine.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-bold text-ink-soft">{t("your plans")}</p>
          <div className="no-scrollbar -mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4">
            {mine.map((e) => (
              <button key={e.id} onClick={() => chat(e)} className="flex shrink-0 items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-sm active:scale-95">
                <span className="h-8 w-8 overflow-hidden rounded-full bg-lime">{e.cover && <img src={e.cover} alt="" className="h-full w-full object-cover" />}</span>
                <span className="max-w-[150px] truncate text-[12.5px] font-bold">{e.title}</span>
                <ChatsCircle size={16} weight="fill" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* day strip, then kind */}
      <div className="no-scrollbar -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4">
        {["all", ...days].map((d) => (
          <button key={d} onClick={() => setDay(d)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${day === d ? "bg-ink text-cream" : "border border-line bg-white/60 text-ink-soft"}`}>
            {d === "all" ? t("this week") : dayLabel(d, todayKey, tomorrowKey)}
          </button>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
        {kinds.map(([k, emoji, label]) => (
          <button key={k} onClick={() => setKind(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold ${kind === k ? "bg-lime text-ink" : "bg-white/60 text-ink-soft"}`}>
            {emoji} {t(label)}
          </button>
        ))}
      </div>

      {!data && <div className="mt-10 flex justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>}
      {data && !shown.length && (
        <p className="mt-8 rounded-[1.4rem] bg-white/70 px-4 py-5 text-center text-[13.5px] text-ink-soft">
          {events.length ? t("nothing in this one. try another day or kind.") : t("we're still filling this city. try another one for now.")}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {shown.map((e, i) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
            onClick={() => setOpen(e)}
            className="cursor-pointer overflow-hidden rounded-[1.6rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.06),0_10px_28px_-14px_rgba(58,50,44,0.3)] active:scale-[0.99]"
          >
            {e.cover && (
              <div className="relative aspect-[16/8] w-full overflow-hidden bg-cream-deep">
                <img src={e.cover} alt="" loading="lazy" onError={(x) => { x.currentTarget.parentElement.style.display = "none" }} className="h-full w-full object-cover" />
                {priceOf(e) && <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-bold">{priceOf(e)}</span>}
              </div>
            )}
            <div className="px-4 pb-3.5 pt-3">
              <p className="text-[12px] font-bold text-ink-soft">
                {dayLabel(dayKey(e.startsAt, tz), todayKey, tomorrowKey)} · {timeOf(e.startsAt, tz)}{e.venue ? ` · ${e.venue}` : ""}
              </p>
              <h3 className="mt-0.5 line-clamp-2 text-[17px] font-bold leading-snug">{e.title}</h3>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                {e.goingCount ? <Faces e={e} /> : <span className="text-[12.5px] text-ink-soft">{t("be the first from irlpass")}</span>}
                <GoingButton e={e} busy={busy === e.id} onToggle={toggle} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 32 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(ev, info) => { if (info.offset.y > 110 || info.velocity.y > 600) setOpen(null) }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] max-w-[460px] overflow-y-auto rounded-t-[2rem] bg-cream pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
            >
              {open.cover && <img src={open.cover} alt="" className="aspect-[16/9] w-full object-cover" />}
              <button onClick={() => setOpen(null)} aria-label={t("close")} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90"><X size={16} weight="bold" /></button>
              <div className="px-5 pt-4">
                <p className="text-[12.5px] font-bold text-ink-soft">
                  {dayLabel(dayKey(open.startsAt, tz), todayKey, tomorrowKey)} · {timeOf(open.startsAt, tz)}{open.endsAt ? `–${timeOf(open.endsAt, tz)}` : ""}{priceOf(open) ? ` · ${priceOf(open)}` : ""}
                </p>
                <h2 className="display mt-1 text-[26px] font-bold leading-tight">{open.title}</h2>
                {open.host && <p className="mt-1 text-[13px] text-ink-soft">{t("by")} {open.host}</p>}
                {(open.venue || open.address) && (
                  <a
                    href={open.lat ? `https://maps.google.com/?q=${open.lat},${open.lng}` : `https://maps.google.com/?q=${encodeURIComponent(open.address || open.venue)}`}
                    target="_blank" rel="noreferrer"
                    className="mt-3 flex items-center gap-2 rounded-[1.2rem] bg-white px-3.5 py-3 text-[13.5px] font-semibold shadow-sm"
                  >
                    <MapPin size={18} weight="fill" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{[open.venue, open.address].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</span>
                    <ArrowUpRight size={15} />
                  </a>
                )}

                <div className="mt-3 rounded-[1.2rem] bg-white px-3.5 py-3 shadow-sm">
                  {open.goingCount ? <Faces e={open} size={30} /> : <p className="text-[13px] font-semibold">{t("nobody from irlpass yet. go first and the chat is yours.")}</p>}
                </div>

                <div className="mt-4 space-y-2">
                  <GoingButton e={open} busy={busy === open.id} onToggle={toggle} big />
                  {open.going && (
                    <button onClick={() => chat(open)} className="flex w-full items-center justify-center gap-2 rounded-full border border-ink py-3 text-[14.5px] font-bold">
                      <ChatsCircle size={18} weight="fill" /> {t("open the group chat")}
                    </button>
                  )}
                  {open.url && (
                    <a href={open.url} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-1.5 py-2.5 text-[13.5px] font-bold text-ink-soft">
                      {open.isFree ? t("rsvp on") : t("tickets on")} {open.source} <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
                {!open.claimed && (
                  <a href={`mailto:hello@irlpass.xyz?subject=${encodeURIComponent(`claim: ${open.title} (#${open.id})`)}`} className="mt-2 block pb-2 text-center text-[12px] text-ink-soft underline-offset-2 hover:underline">
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
