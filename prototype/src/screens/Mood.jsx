import { useCallback, useEffect, useState } from "react"
import { cachedJson } from "../lib/cached"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUpRight, ChatsCircle, CheckCircle, CircleNotch, Clock, MapPin, Star, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { joinVibes } from "../lib/vibes"

// the guide: tonight in medellín, the way a good city guide reads. pick a
// mood, browse hand-picked spots with real photos and a line on why you go,
// say you're going, and see who from irlpass will be there.
const MOODS = [
  { key: "pregame", emoji: "🍸", label: "pregame", sub: "rooftops, bars, dinner", title: "before the night" },
  { key: "afters", emoji: "🪩", label: "afters", sub: "clubs, late", title: "after midnight" },
  { key: "chill", emoji: "☕", label: "something chill", sub: "coffee, gym, a walk", title: "slow day" },
]

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
// google's "5 PM to 2 AM" for today, in the reader's words
const hoursToday = (hours = []) => {
  const today = DAYS[new Date().getDay()]
  const h = hours.find((x) => x.day === today)?.hours
  if (!h) return ""
  return /closed/i.test(h) ? t("closed today") : h.replace(/ /g, " ").toLowerCase()
}
const fmtCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0))

function Face({ p, size = "h-9 w-9" }) {
  return (
    <div className={`relative ${size} shrink-0 overflow-hidden rounded-full border-2 border-cream bg-cream-deep`}>
      {p.photo ? (
        <img
          src={p.photo}
          alt=""
          onError={(e) => { e.currentTarget.style.display = "none" }}
          className={`h-full w-full object-cover ${p.locked ? "scale-105 blur-[2px]" : ""}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[12px] font-bold text-ink-soft">
          {String(p.first || "?")[0].toUpperCase()}
        </span>
      )}
    </div>
  )
}

function Meta({ s, light = false }) {
  const bits = []
  if (s.rating) bits.push(
    <span key="r" className="flex items-center gap-0.5">
      <Star size={12} weight="fill" className={light ? "text-cream" : "text-ink"} /> {Number(s.rating).toFixed(1)}
      {s.reviews ? <span className="opacity-70">({fmtCount(s.reviews)})</span> : null}
    </span>
  )
  if (s.price) bits.push(<span key="p">{s.price}</span>)
  const h = hoursToday(s.hours)
  if (h) bits.push(<span key="h">{h}</span>)
  if (!bits.length) return null
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold ${light ? "text-cream/90" : "text-ink-soft"}`}>
      {bits.map((b, i) => [i > 0 && <span key={`d${i}`} className="opacity-50">·</span>, b])}
    </div>
  )
}

function GoingButton({ s, busy, onToggle, full = false }) {
  return (
    <motion.button
      key={s.imGoing ? "on" : "off"}
      initial={{ scale: s.imGoing ? 0.85 : 1 }}
      animate={{ scale: 1 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 520, damping: 16 }}
      onClick={(e) => { e.stopPropagation(); onToggle(s) }}
      disabled={busy}
      className={`shrink-0 rounded-full px-4 py-2.5 text-[13px] font-bold disabled:opacity-50 ${full ? "w-full" : ""} ${
        s.imGoing ? "border-2 border-ink bg-white text-ink" : "bg-ink text-cream"
      }`}
    >
      {s.imGoing ? <span className="flex items-center justify-center gap-1"><CheckCircle size={15} weight="fill" /> {t("you're going")}</span> : t("i'm going tonight")}
    </motion.button>
  )
}

function WhoGoing({ s }) {
  if (!s.going) return <p className="text-[12.5px] font-semibold text-ink-soft">{t("nobody from irlpass yet. be the first.")}</p>
  const match = s.people.find((p) => !p.me && p.shared?.length)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex -space-x-2">
        {s.people.slice(0, 5).map((p) => (
          <span key={p.memberNo} className="relative">
            <Face p={p} />
            {p.outNow && <span className="out-dot absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-cream bg-[#5fd35f]" />}
          </span>
        ))}
      </div>
      <p className="min-w-0 truncate text-[12.5px] font-semibold">
        {s.going} {t("going tonight")}
        {match && <span className="text-ink-soft"> · {match.first} {t("is into")} {joinVibes(match.shared)}</span>}
      </p>
    </div>
  )
}

// the full page for one spot
function SpotSheet({ s, busy, onToggle, onOpenRoom, onClose }) {
  const [shot, setShot] = useState(0)
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="fixed inset-x-0 bottom-0 top-6 z-50 mx-auto max-w-[460px] overflow-y-auto rounded-t-[1.9rem] bg-cream"
      >
        <div className="relative">
          {s.photos.length > 0 ? (
            <div
              onScroll={(e) => setShot(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
              className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto rounded-t-[1.9rem] [scrollbar-width:none]"
            >
              {s.photos.map((src) => (
                <img key={src} src={src} alt="" className="h-full w-full shrink-0 snap-center object-cover" />
              ))}
            </div>
          ) : (
            <div className="aspect-[4/3] rounded-t-[1.9rem] bg-cream-deep" />
          )}
          <button onClick={onClose} aria-label={t("close")} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-ink/60 text-cream backdrop-blur">
            <X size={18} weight="bold" />
          </button>
          {s.photos.length > 1 && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {s.photos.map((src, i) => <span key={src} className={`h-1.5 rounded-full transition-all ${i === shot ? "w-5 bg-cream" : "w-1.5 bg-cream/60"}`} />)}
            </div>
          )}
        </div>

        <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
            {[s.category || s.kind, s.area].filter(Boolean).join(" · ")}
          </p>
          <h2 className="display mt-1 text-[32px] font-bold leading-[0.95] tracking-tight">{s.name}</h2>
          <div className="mt-2"><Meta s={s} /></div>

          {s.blurb && (
            <p className="mt-4 border-l-4 border-lime-deep pl-3 text-[16px] leading-snug">{s.blurb}</p>
          )}
          {s.quote && (
            <p className="mt-3 text-[13.5px] italic leading-snug text-ink-soft">“{s.quote}” <span className="not-italic">· {t("a google review")}</span></p>
          )}

          <div className="mt-5 rounded-[1.5rem] border-2 border-line bg-white/80 p-4">
            <WhoGoing s={s} />
            <div className="mt-3 flex gap-2">
              <GoingButton s={s} busy={busy} onToggle={onToggle} full />
            </div>
            {s.imGoing && (
              <button
                onClick={() => onOpenRoom?.({ channel: s.room, title: `${s.name} ${t("tonight")}` })}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-white py-2.5 text-[13px] font-bold"
              >
                <ChatsCircle size={15} weight="fill" /> {t("chat with who's going")}
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2 text-[13.5px]">
            {s.address && (
              <p className="flex items-start gap-2"><MapPin size={16} weight="fill" className="mt-0.5 shrink-0 text-ink-soft" /> {s.address}</p>
            )}
            {hoursToday(s.hours) && (
              <p className="flex items-start gap-2"><Clock size={16} weight="fill" className="mt-0.5 shrink-0 text-ink-soft" /> {t("today")}: {hoursToday(s.hours)}</p>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            {s.mapsUrl && (
              <a href={s.mapsUrl} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-full border-2 border-line bg-white py-2.5 text-[13px] font-bold">
                {t("open in maps")} <ArrowUpRight size={13} weight="bold" />
              </a>
            )}
            {s.website && (
              <a href={s.website} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-full border-2 border-line bg-white py-2.5 text-[13px] font-bold">
                {t("website")} <ArrowUpRight size={13} weight="bold" />
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}

export default function Mood({ token, onOpenRoom }) {
  const [data, setData] = useState(null)
  const [mood, setMood] = useState(null)
  const [q, setQ] = useState("") // search the spots, not free-text moods
  const [until, setUntil] = useState("late") // 9pm | midnight | late (6am)
  const [outOpen, setOutOpen] = useState(false)
  const [area, setArea] = useState("")
  const [busy, setBusy] = useState(null)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(() => {
    cachedJson(`/api/mood?t=${token}&city=medellin`, (d) => { setData(d); setMood((m) => m || d.mood || "pregame") })
      .catch(() => setData((d) => d || { board: {}, presence: [] }))
  }, [token])
  useEffect(() => { load() }, [load])
  // the board is live on a night out: refresh every half minute
  useEffect(() => { const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])

  const post = (body) =>
    fetch("/api/mood", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, ...body }),
    }).then((r) => r.json()).catch(() => null)

  const pickMood = async (key) => {
    setMood(key)
    await post({ action: "mood", mood: key })
  }

  const toggleGoing = async (spot) => {
    setBusy(spot.id)
    await post({ action: "going", spotId: spot.id, on: !spot.imGoing })
    await load()
    setBusy(null)
  }

  const goOut = async () => {
    if (!area.trim()) return
    setBusy("out")
    await post({ action: "out", area, until })
    setOutOpen(false)
    setArea("")
    await load()
    setBusy(null)
  }

  if (!data) {
    return (
      <div className="px-4 pt-4">
        <div className="shimmer h-3 w-44 rounded" />
        <div className="shimmer mt-2 h-9 w-56 rounded-xl" />
        <div className="mt-4 space-y-5">
          {[0, 1].map((i) => <div key={i} className="shimmer aspect-[4/3] rounded-[1.75rem]" />)}
        </div>
      </div>
    )
  }

  const needle = q.trim().toLowerCase()
  const matches = (s) =>
    [s.name, s.area, s.kind, s.category, s.blurb].filter(Boolean).join(" ").toLowerCase().includes(needle)
  // typing searches every board; otherwise it's tonight's mood
  const spots = needle
    ? Object.values(data.board || {}).flat().filter(matches)
    : data.board?.[mood] || []
  // something chill reads as two sections: coffee & walks, then recovery
  const sections = !needle && mood === "chill"
    ? [
        { key: "easy", label: t("coffee & a walk"), list: spots.filter((s) => s.tag !== "recovery") },
        { key: "recovery", label: `🧘 ${t("recovery · gyms, yoga, sauna")}`, list: spots.filter((s) => s.tag === "recovery") },
      ]
    : [{ key: "all", label: null, list: spots }]
  const open = spots.find((s) => s.id === openId) || Object.values(data.board || {}).flat().find((s) => s.id === openId)
  const others = (data.presence || []).filter((p) => !p.me)
  const outEnds = data.myOut ? new Date(data.myOut.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase() : null
  const meta = MOODS.find((m) => m.key === mood)
  const dateLine = new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }).toLowerCase()

  return (
    <div className="relative px-4 pb-28 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">{t("the guide")} · medellín · {dateLine}</p>
      <h2 className="display mt-1 text-[34px] font-bold leading-[0.95] tracking-tight">{t(meta?.title || "tonight")}</h2>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {MOODS.map((m) => (
          <button
            key={m.key}
            onClick={() => pickMood(m.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-[13px] font-bold ${
              mood === m.key ? "border-ink bg-ink text-cream" : "border-line bg-white/70 text-ink"
            }`}
          >
            <span>{m.emoji}</span> {t(m.label)}
          </button>
        ))}
      </div>

      {/* search the spots on this board: "rooftop", "sushi", "yoga" */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search spots, like rooftop or sushi")}
        className="mt-2 w-full rounded-full border-2 border-line bg-white/80 px-4 py-2.5 text-[14px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50 focus:border-ink"
      />

      {/* who's out right now: neighborhood only, gone after a few hours */}
      <div className="mt-3 rounded-[1.5rem] border-2 border-line bg-white/70 p-3">
        {data.myOut ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-bold">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#5fd35f] align-middle" />
              {t("you're out in")} {data.myOut.area} · {t("until")} {outEnds}
            </p>
            <button onClick={async () => { await post({ action: "out", off: true }); load() }} className="shrink-0 rounded-full border-2 border-line px-3 py-1 text-[12px] font-bold text-ink-soft">
              {t("stop")}
            </button>
          </div>
        ) : outOpen ? (
          <div className="flex gap-2">
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goOut()}
              autoFocus
              maxLength={40}
              placeholder={t("neighborhood, like provenza")}
              className="w-full rounded-full border-2 border-line bg-white px-3.5 py-2 text-[14px] font-semibold outline-none focus:border-ink"
            />
            <button onClick={goOut} disabled={busy === "out"} className="shrink-0 rounded-full bg-ink px-4 text-[13px] font-bold text-cream disabled:opacity-50">{t("go")}</button>
            <button onClick={() => setOutOpen(false)} aria-label={t("close")} className="shrink-0 text-ink-soft"><X size={18} /></button>
          </div>
        ) : null}
        {outOpen && !data.myOut && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {[["9pm", t("til 9pm")], ["midnight", t("til midnight")], ["late", t("all night")]].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setUntil(k)}
                className={`rounded-full border-2 px-3 py-1 text-[12px] font-bold ${until === k ? "border-ink bg-lime" : "border-line bg-white text-ink-soft"}`}
              >
                {label}
              </button>
            ))}
            <span className="w-full pt-0.5 text-[11.5px] text-ink-soft">{t("visible to medellín members, and posted once in the medellín chat")}</span>
          </div>
        )}
        {!data.myOut && !outOpen && (
          <button onClick={() => setOutOpen(true)} className="flex w-full items-center justify-center gap-2 text-[14px] font-bold">
            <MapPin size={17} weight="fill" /> {t("i'm out tonight, come find me")}
          </button>
        )}
        {others.length > 0 && (
          <div className="mt-3 flex gap-3 overflow-x-auto border-t border-line/70 pt-3">
            {others.map((p) => (
              <div key={p.memberNo} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
                <Face p={p} size="h-12 w-12" />
                <span className="w-full truncate text-[11px] font-bold">{p.first}</span>
                <span className="w-full truncate text-[10px] text-ink-soft">📍 {p.area}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sections.map((sec) => (
      <div key={sec.key}>
      {sec.label && sec.list.length > 0 && (
        <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">{sec.label}</p>
      )}
      <div className="mt-4 space-y-5">
        {sec.list.map((s, i) => (
          <motion.article
            key={s.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 6) * 0.04 }}
            onClick={() => setOpenId(s.id)}
            className="cursor-pointer"
          >
            <div className="lift relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-cream-deep">
              {s.photos[0] && <img src={s.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
              {s.going > 0 && (
                <span className="absolute left-3 top-3 rounded-full bg-cream/95 px-2.5 py-1 text-[11.5px] font-bold">
                  {s.going} {t("from irlpass going")}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 p-4 text-cream">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cream/80">
                  {[s.category || s.kind, s.area].filter(Boolean).join(" · ")}
                </p>
                <h3 className="display mt-0.5 text-[27px] font-bold leading-[0.95] tracking-tight">{s.name}</h3>
                <div className="mt-1.5"><Meta s={s} light /></div>
              </div>
            </div>
            <div className="px-1 pt-2.5">
              {s.blurb && <p className="text-[14.5px] leading-snug">{s.blurb}</p>}
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <WhoGoing s={s} />
                <GoingButton s={s} busy={busy === s.id} onToggle={toggleGoing} />
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      </div>
      ))}
      {spots.length === 0 && (
        <p className="py-6 text-center text-[13px] text-ink-soft">{needle ? t("no spots match that") : t("no spots here yet")}</p>
      )}

      <AnimatePresence>
        {open && (
          <SpotSheet
            s={open}
            busy={busy === open.id}
            onToggle={toggleGoing}
            onOpenRoom={onOpenRoom}
            onClose={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
