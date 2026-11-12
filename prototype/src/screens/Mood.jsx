import { useCallback, useEffect, useState } from "react"
import { cachedJson } from "../lib/cached"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUpRight, CalendarCheck, ChatsCircle, CheckCircle, CircleNotch, Clock, Gift, HandWaving, InstagramLogo, MapPin, Megaphone, Plus, QrCode, Star, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { joinVibes } from "../lib/vibes"
import { countryOf } from "../lib/countries"
import RideCard from "../components/RideCard"
import InvitePrompt from "../components/InvitePrompt"
import { askPush } from "../lib/push"
import { MoreList } from "../lib/more"
import { cityChip } from "../lib/cities"
import CityNow from "../components/CityNow"
import AddSpot from "../components/AddSpot"

// the guide: your city right now, the way a good city guide reads. pick a
// mood, browse spots with real photos and a line on why you go, say you're
// going, and see who from irlpass will be there. every city gets the same
// guide (josh v5); a city with no spots yet asks its members to add them.
const MOODS = [
  { key: "lockin", emoji: "🧘", label: "lock in", title: "lock in" },
  { key: "explore", emoji: "🗺️", label: "explore", title: "go see something" },
  { key: "pregame", emoji: "🍸", label: "pregame", title: "before the night" },
  { key: "afters", emoji: "🪩", label: "afters", title: "after midnight" },
  { key: "chill", emoji: "☕", label: "chill", title: "slow day" },
]
// the right chip for the moment, on the city's own clock: weekday daytime is
// lock in, after midnight is afters, evenings are pregame
const moodFor = (l) => {
  if (!l) return "pregame"
  if (l.hour < 5) return "afters"
  if (l.day >= 1 && l.day <= 5 && l.hour < 17) return "lockin"
  if (l.hour >= 17) return "pregame"
  return "chill"
}
const PRICE_LEVELS = ["$", "$$", "$$$", "$$$$"]
// "$$ · ~$25–40 per person", next to the name
export const priceLine = (s) => {
  const lvl = s.priceLevel ? "$".repeat(s.priceLevel) : (/^[$]{1,4}$/.test(s.price || "") ? s.price : "")
  const range = s.priceRange || (/\d/.test(s.price || "") ? s.price : "")
  return [lvl, range ? `~${range.replace(/^~/, "")} ${t("per person")}` : ""].filter(Boolean).join(" · ")
}

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
    <div className={`relative ${size} shrink-0 overflow-hidden rounded-full border border-cream bg-cream-deep`}>
      {p.photo ? (
        <img
          src={p.photo}
          alt=""
          onError={(e) => { e.currentTarget.style.display = "none" }}
          className={`h-full w-full object-cover ${p.locked && !p.faceOpen ? "scale-105 blur-[2px]" : ""}`}
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
  const pl = priceLine(s)
  if (pl) bits.push(<span key="p" className={light ? "rounded-full bg-cream/20 px-1.5" : "font-bold text-ink"}>{pl}</span>)
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
      className={`shrink-0 rounded-full px-4 py-2.5 text-[13px] font-bold disabled:opacity-50 ${full ? "w-full" : ""} ${ s.imGoing ? "border border-line bg-white text-ink" : "bg-ink text-cream" }`}
    >
      {s.imGoing ? <span className="flex items-center justify-center gap-1"><CheckCircle size={15} weight="fill" /> {t("you're going")}</span> : t("i'm going")}
    </motion.button>
  )
}

function WhoGoing({ s }) {
  if (!s.going && s.imGoing) return <p className="text-[12.5px] font-semibold text-ink-soft">{t("just you so far. bring someone?")}</p>
  if (!s.going) return <p className="text-[12.5px] font-semibold text-ink-soft">{t("nobody from irlpass yet. be the first.")}</p>
  const match = s.people.find((p) => !p.me && p.shared?.length)
  // where tonight's crowd is from, the way airbnb shows who's on an experience
  const flags = [...new Set(s.people.map((p) => countryOf(p.country)?.flag).filter(Boolean))].slice(0, 6)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex -space-x-2">
        {s.people.slice(0, 5).map((p) => (
          <span key={p.memberNo} className="relative">
            <Face p={p} />
            {p.outNow && <span className="out-dot absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-cream bg-[#5fd35f]" />}
          </span>
        ))}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold">
          {s.going} {t("going")}
          {match && <span className="text-ink-soft"> · {match.first} {t("is into")} {joinVibes(match.shared)}</span>}
        </p>
        {flags.length > 0 && (
          <p className="truncate text-[11.5px] text-ink-soft">{t("from")} {flags.join(" ")}</p>
        )}
      </div>
    </div>
  )
}

// the full page for one spot
// a pro venue counts views and booking taps on its dashboard
const logVenue = (slug, action, token) =>
  fetch("/api/venue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, action, t: token }), keepalive: true }).catch(() => {})

// what a pro venue posted for tonight or this week, in its own words
function VenuePosts({ partner }) {
  if (!partner.posts?.length) return null
  return (
    <div className="mt-5 space-y-2">
      {partner.posts.map((p) => (
        <div key={p.id} className="rounded-[1.4rem] border border-line bg-white/80 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink-soft"><Megaphone size={13} weight="fill" /> {p.day ? t("on tonight") : t("on this week")}</p>
          <p className="mt-0.5 text-[15.5px] font-bold leading-snug">{p.title}</p>
          {p.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{p.body}</p>}
        </div>
      ))}
    </div>
  )
}

// a partner venue's perk: claimed at the door with the irlpass qr, plus a
// bonus for posting a story (the venue pays us; members just show up)
function PerkCard({ partner, token }) {
  return (
    <>
    <VenuePosts partner={partner} />
    <div className="mt-5 overflow-hidden rounded-[1.5rem] bg-lime">
      <div className="px-4 pb-3.5 pt-4">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink/70"><Gift size={14} weight="fill" /> {t("irlpass perk")}</p>
        <p className="display mt-1 text-[24px] font-bold leading-[1.02] tracking-tight">{partner.perk}</p>
      </div>
      <div className="space-y-2 bg-white/55 px-4 py-3 text-[13px] leading-snug">
        <p className="flex items-start gap-2"><QrCode size={16} weight="bold" className="mt-0.5 shrink-0" /> {t("scan the irlpass qr at the door and show the screen at the bar")}</p>
        <p className="flex items-start gap-2">
          <InstagramLogo size={16} weight="bold" className="mt-0.5 shrink-0" />
          {partner.story ? `${t("post a story tagging them and get")} ${partner.story}` : t("post a story tagging them so more of us end up here")}
        </p>
      </div>
      {partner.booking && (
        <a
          href={partner.booking} target="_blank" rel="noreferrer"
          onClick={() => logVenue(partner.slug, "book", token)}
          className="flex items-center justify-center gap-1.5 bg-ink py-3 text-[14px] font-bold text-cream"
        >
          <CalendarCheck size={16} weight="fill" /> {t("book a table")} <ArrowUpRight size={13} weight="bold" />
        </a>
      )}
    </div>
    </>
  )
}

function SpotSheet({ s, token, busy, onToggle, onOpenRoom, onClose }) {
  const [shot, setShot] = useState(0)
  const slug = s.partner?.slug
  useEffect(() => { if (slug) logVenue(slug, "view", token) }, [slug, token])
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
          <p className="text-[12px] text-ink-soft font-semibold">
            {[s.category || s.kind, s.area].filter(Boolean).join(" · ")}
          </p>
          <h2 className="display mt-1 text-[32px] font-bold leading-[0.95] tracking-tight">{s.name}</h2>
          <div className="mt-2"><Meta s={s} /></div>
          {s.groupSpend > 0 && <p className="mt-1.5 text-[12.5px] font-bold text-ink">{t("irlpass groups spent")} ~${Math.round(s.groupSpend)} {t("per person here")}</p>}

          {s.blurb && (
            <p className="mt-4 border-l-4 border-lime-deep pl-3 text-[16px] leading-snug">{s.blurb}</p>
          )}
          {s.quote && (
            <p className="mt-3 text-[13.5px] italic leading-snug text-ink-soft">“{s.quote}” <span className="not-italic">· {t("a google review")}</span></p>
          )}

          {s.partner && <PerkCard partner={s.partner} token={token} />}

          <div className="mt-5 rounded-[1.5rem] border border-line bg-white/80 p-4">
            <WhoGoing s={s} />
            <div className="mt-3 flex gap-2">
              <GoingButton s={s} busy={busy} onToggle={onToggle} full />
            </div>
            {s.imGoing && (
              <button
                onClick={() => onOpenRoom?.({ channel: s.room, title: `${s.name} ${t("tonight")}` })}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-white py-2.5 text-[13px] font-bold"
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
              <a href={s.mapsUrl} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-full border border-line bg-white py-2.5 text-[13px] font-bold">
                {t("open in maps")} <ArrowUpRight size={13} weight="bold" />
              </a>
            )}
            {s.website && (
              <a href={s.website} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-full border border-line bg-white py-2.5 text-[13px] font-bold">
                {t("website")} <ArrowUpRight size={13} weight="bold" />
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}

export default function Mood({ token, me, city: cityProp, onOpenRoom, focusSpot, onFocused, onBuyRide, planWith, onPlanDone, onPaywall, onCityMoved }) {
  const city = cityProp || me?.city || "medellin"
  const [whereOpen, setWhereOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [priceOn, setPriceOn] = useState(undefined) // undefined = their budget from onboarding
  const [downBusy, setDownBusy] = useState(false)
  const [data, setData] = useState(null)
  const [mood, setMood] = useState(null)
  const [q, setQ] = useState("") // search the spots, not free-text moods
  const [until, setUntil] = useState("late") // 9pm | midnight | late (6am)
  const [outOpen, setOutOpen] = useState(false)
  const [area, setArea] = useState("")
  const [busy, setBusy] = useState(null)
  const [openId, setOpenId] = useState(null)
  // which night the board is for: tonight, or a night you're planning ahead
  const [night, setNight] = useState(null)
  useEffect(() => { if (planWith?.nights?.length) setNight(planWith.nights[0]) }, [planWith])
  const [invite, setInvite] = useState(null) // { spot, when } right after a plan is born
  const [invited, setInvited] = useState(null) // "anthony invited" confirmation
  useEffect(() => { if (!invited) return; const id = setTimeout(() => setInvited(null), 6000); return () => clearTimeout(id) }, [invited])
  // after midnight the night you're in is "still out" and the coming evening is
  // "tonight" (instead of "tonight" next to "7 wed" for what feels like one night)
  const lateNight = new Date().getHours() < 6
  const chipLabel = (d) => {
    if (!data?.tonight) return d
    const next = new Date(`${data.tonight}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1)
    const nextIso = next.toISOString().slice(0, 10)
    if (d === data.tonight) return lateNight ? t("still out") : t("tonight")
    if (d === nextIso) return lateNight ? t("tonight") : t("tomorrow")
    return new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()
  }
  const nightLabel = (iso) =>
    !iso || iso === data?.tonight
      ? t("tonight")
      : new Date(`${iso}T12:00:00Z`).toLocaleDateString([], { weekday: "long", timeZone: "UTC" }).toLowerCase()
  // a @spot tapped in a chat lands here with that spot's sheet open
  useEffect(() => { if (focusSpot) { setOpenId(focusSpot); onFocused?.() } }, [focusSpot, onFocused])
  const [places, setPlaces] = useState([]) // anywhere in town that matches the search

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) { setPlaces([]); return }
    const id = setTimeout(() => {
      fetch(`/api/mood?t=${token}&city=${city}&search=${encodeURIComponent(text)}`)
        .then((r) => r.json())
        .then((d) => setPlaces(d.places || []))
        .catch(() => setPlaces([]))
    }, 300)
    return () => clearTimeout(id)
  }, [q, token])

  // google maps itself: slower (~20s) but has every place, and takes a pasted maps link
  const [gPlaces, setGPlaces] = useState(null) // null = not searched; [] = nothing found
  const [gBusy, setGBusy] = useState(false)
  const [gErr, setGErr] = useState("")
  useEffect(() => { setGPlaces(null); setGErr("") }, [q])
  const searchGoogle = async () => {
    setGBusy(true)
    setGErr("")
    const d = await fetch(`/api/mood?t=${token}&city=${city}&google=${encodeURIComponent(q.trim())}`).then((r) => r.json()).catch(() => null)
    setGBusy(false)
    if (!d?.places) return setGErr(d?.error || t("couldn't reach google maps. try again"))
    setGPlaces(d.places)
  }
  const isMapsLink = /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/.test(q.trim())
  useEffect(() => { if (isMapsLink && gPlaces === null && !gBusy) searchGoogle() }, [isMapsLink]) // eslint-disable-line react-hooks/exhaustive-deps

  const addPlace = async (place) => {
    setBusy(place.osmId)
    // it goes on the tab you added it from (a wine bar added on chill stays on chill)
    await post({ action: "add", place, mood: mood || place.mood, night: data?.night })
    await load()
    setBusy(null)
  }

  const load = useCallback(() => {
    cachedJson(`/api/mood?t=${token}&city=${city}${night ? `&night=${night}` : ""}`, (d) => { setData(d); setMood((m) => m || (d.mood === "lockin" || d.mood === "explore" ? null : d.mood) || moodFor(d.local)) })
      .catch(() => setData((d) => d || { board: {}, presence: [] }))
  }, [token, night, city])
  // a different city is a different board
  useEffect(() => { setData(null); setNight(null); setQ("") }, [city])
  useEffect(() => { load() }, [load])
  // the board is live on a night out: refresh every half minute
  useEffect(() => { const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])

  const post = (body) =>
    fetch("/api/mood", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, city, ...body }),
    }).then((r) => r.json()).catch(() => null)

  const pickMood = async (key) => {
    setMood(key)
    await post({ action: "mood", mood: key })
  }

  const toggleGoing = async (spot) => {
    setBusy(spot.id)
    await post({ action: "going", spotId: spot.id, on: !spot.imGoing, night: data?.night })
    if (!spot.imGoing) {
      // a plan just got made: ask the person you're planning with, then offer to pull more people in
      if (planWith) {
        const r = await fetch("/api/mood", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ t: token, city, action: "invite", spotId: spot.id, night: data?.night, to: planWith.memberNo }),
        }).then(async (x) => ({ status: x.status })).catch(() => ({ status: 0 }))
        if (r.status === 200) setInvited(planWith.first)
        onPlanDone?.()
        setOpenId(null) // one sheet at a time
        if (r.status === 402) {
          // one sheet at a time: the paywall is the moment, the share sheet can wait
          onPaywall?.({ reason: "invite", next: `invite-${spot.id}-${String(data?.night || "").replace(/-/g, "")}-${planWith.memberNo}`, draft: `${spot.name} · ${nightLabel(data?.night)} · ${t("with")} ${planWith.first}` })
          await load()
          setBusy(null)
          return
        }
      }
      setOpenId(null)
      setInvite({ spot, when: nightLabel(data?.night) })
    }
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
  const budgetLvl = priceOn === undefined ? (data.budget || null) : priceOn
  const affordable = (s) => !budgetLvl || !s.priceLevel || s.priceLevel <= budgetLvl.length
  const allSpots = Object.values(data.board || {}).flat().filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i)
  const spots = (needle
    ? allSpots.filter(matches)
    : data.board?.[mood] || []).filter(affordable)
  const cityEmpty = allSpots.length === 0
  // something chill reads as two sections: coffee & walks, then recovery
  const sections = !needle && mood === "chill"
    ? [
        { key: "easy", label: t("coffee & a walk"), list: spots.filter((s) => s.tag !== "recovery") },
        { key: "recovery", label: `🧘 ${t("recovery · gyms, yoga, sauna")}`, list: spots.filter((s) => s.tag === "recovery") },
      ]
    : [{ key: "all", label: null, list: spots }]
  const boardIds = new Set(Object.values(data.board || {}).flat().map((s) => s.id))
  const norm = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
  const boardNames = new Set(Object.values(data.board || {}).flat().map((s) => norm(s.name)))
  const extra = places.filter((p) => !(p.spotId && boardIds.has(p.spotId)) && !boardNames.has(norm(p.name))).slice(0, 5)
  const open = spots.find((s) => s.id === openId) || Object.values(data.board || {}).flat().find((s) => s.id === openId)
  const perks = Object.values(data.board || {}).flat().filter((s, i, all) => s.partner && all.findIndex((x) => x.id === s.id) === i)
  const others = (data.presence || []).filter((p) => !p.me)
  const outEnds = data.myOut ? new Date(data.myOut.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase() : null
  const meta = MOODS.find((m) => m.key === mood)
  const cityName = String(data.cityName || cityChip(city).name || "").toLowerCase()
  const downOthers = (data.down || []).filter((p) => !p.me)
  const toggleDown = async () => {
    setDownBusy(true)
    await post({ action: "down", on: !data.myDown, mood: mood || "chill" })
    if (!data.myDown) setTimeout(() => askPush(t("people who are down to hang")), 500)
    await load()
    setDownBusy(false)
  }
  const dateLine = new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }).toLowerCase()

  return (
    <div className="relative px-4 pb-28 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1 text-[12px] text-ink-soft font-semibold">
            <span className="shrink-0">{t("the guide")} ·</span>
            {/* your city is a button: tap it to say where you are now */}
            <button onClick={() => setWhereOpen(true)} className="flex min-w-0 items-center gap-1 rounded-full border border-line bg-white/70 px-2 py-0.5 font-bold text-ink active:scale-95">
              <span className="truncate">{cityChip(city).emoji} {cityName}</span><span aria-hidden className="text-[10px]">▾</span>
            </button>
            <span className="truncate">· {dateLine}</span>
          </p>
          <CityNow token={token} city={city} open={whereOpen} onClose={() => setWhereOpen(false)} onMoved={onCityMoved} />
          <h2 className="display mt-1 text-[34px] font-bold leading-[0.95] tracking-tight">{t(meta?.title || "tonight")}</h2>
        </div>
        {/* know a spot? add it (crowdsourced, a mod approves it) */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setAddOpen(true)}
          aria-label={t("add a spot")}
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-cream shadow-[0_6px_16px_-8px_rgba(28,27,23,0.6)]"
        >
          <Plus size={18} weight="bold" />
        </motion.button>
      </div>

      {/* a city with no spots yet: same layout, and a way to be the first */}
      {cityEmpty && !needle && (
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setAddOpen(true)}
          className="relative mt-4 block w-full overflow-hidden rounded-[1.75rem] bg-ink p-5 text-left text-cream"
        >
          <span className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-lime/25 blur-2xl" />
          <span className="text-[12px] font-bold text-lime">{cityChip(city).emoji} {cityName} {t("is just getting started")}</span>
          <span className="display mt-1.5 block text-[28px] font-bold leading-[1] tracking-tight">{t("know a spot?")}<br />{t("add it.")}</span>
          <span className="mt-2 block max-w-[290px] text-[13.5px] leading-snug text-cream/75">{t("your coffee place, the gym, the bar you'd take a friend to. be the first to make a plan here.")}</span>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2.5 text-[13.5px] font-bold text-ink"><Plus size={15} weight="bold" /> {t("add a spot")}</span>
        </motion.button>
      )}
      {/* rides are off for now (not scalable); the checkout stays in the code */}

      {invited && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-[1.4rem] bg-lime px-4 py-3">
          <p className="text-[14.5px] font-bold">✓ {invited} {t("invited")}</p>
          <p className="text-[12px] text-ink/70">{t("they get a ping. you'll see them here when they're in.")}</p>
        </motion.div>
      )}
      {/* making a plan with someone: pick the night, then the spot */}
      {planWith && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-3 rounded-[1.4rem] bg-ink px-4 py-3 text-cream">
          {planWith.photo && <img src={planWith.photo} alt="" className="h-10 w-10 shrink-0 rounded-full border border-cream object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold leading-tight">{t("making a plan with")} {planWith.first}</p>
            <p className="text-[12px] text-cream/70">{t("pick a spot and tap i'm going. we'll ask them along.")}</p>
          </div>
          <button onClick={() => onPlanDone?.()} aria-label={t("close")} className="shrink-0 text-cream/70"><X size={18} /></button>
        </motion.div>
      )}

      {/* plan tonight or any night ahead (the overlap with them, when planning together) */}
      {data.tonight && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {(planWith?.nights?.length
            ? planWith.nights
            : Array.from({ length: 7 }, (_, i) => { const d = new Date(`${data.tonight}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10) })
          ).map((d) => {
            const on = (night || data.tonight) === d
            return (
              <button
                key={d}
                onClick={() => setNight(d === data.tonight ? null : d)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold ${on ? "border-ink bg-ink text-cream" : "border-line bg-white/70"}`}
              >
                {chipLabel(d)}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {MOODS.map((m) => (
          <button
            key={m.key}
            onClick={() => pickMood(m.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-bold ${ mood === m.key ? "border-ink bg-ink text-cream" : "border-line bg-white/70 text-ink" }`}
          >
            <span>{m.emoji}</span> {t(m.label)}
          </button>
        ))}
      </div>

      {/* price: defaults to their usual night out from onboarding */}
      {!cityEmpty && (
        <div className="mt-2 flex items-center gap-1.5">
          {PRICE_LEVELS.map((p) => {
            const on = budgetLvl === p
            return (
              <button
                key={p}
                onClick={() => setPriceOn(on ? null : p)}
                className={`rounded-full border px-3 py-1 text-[12px] font-bold tabular-nums ${on ? "border-ink bg-ink text-cream" : "border-line bg-white/60 text-ink-soft"}`}
              >
                {p === "$$$$" ? p : `${t("up to")} ${p}`}
              </button>
            )
          })}
        </div>
      )}

      {/* search the spots on this board: "rooftop", "sushi", "yoga" */}
      <input
        type="search"
        name="spot-search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        enterKeyHint="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search spots, like rooftop or sushi")}
        className="mt-2 w-full rounded-full border border-line bg-white/80 px-4 py-2.5 text-[14px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50 focus:border-ink"
      />

      {/* perks: partner spots give members something for showing up and posting */}
      {!needle && perks.length > 0 && (
        <section className="mt-4">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft"><Gift size={13} weight="fill" /> {t("perks for irlpass members")}</p>
          <div className="-mx-4 mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {perks.map((s) => (
              <motion.button
                key={s.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setOpenId(s.id)}
                className="relative h-[168px] w-[148px] shrink-0 overflow-hidden rounded-[1.4rem] bg-cream-deep text-left"
              >
                {s.photos[0] && <img src={s.photos[0]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="absolute left-2.5 top-2.5 flex max-w-[calc(100%-1.25rem)] items-center gap-1 truncate rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink">
                  {s.partner.posts?.[0] ? <Megaphone size={11} weight="fill" className="shrink-0" /> : <Gift size={11} weight="fill" className="shrink-0" />} <span className="truncate">{s.partner.posts?.[0]?.title || s.partner.perk}</span>
                </span>
                <span className="absolute inset-x-0 bottom-0 p-3 text-cream">
                  <span className="block truncate text-[11px] font-semibold text-cream/75">{s.area}</span>
                  <span className="display block text-[18px] font-bold leading-[1] tracking-tight">{s.name}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* who's out right now: neighborhood only, gone after a few hours */}
      {(!night || night === data.tonight) && (
      <div className="mt-3 rounded-[1.5rem] border border-line bg-white/70 p-3">
        {/* down to hang: 3 hours, everyone here who's also down gets told */}
        <div className="mb-3 flex items-center gap-3 border-b border-line/70 pb-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${data.myDown ? "bg-lime" : "bg-cream-deep"}`}><HandWaving size={18} weight="fill" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold leading-tight">{data.myDown ? t("you're down to hang") : t("down to hang now?")}</p>
            <p className="truncate text-[12px] text-ink-soft">
              {data.myDown
                ? `${t("until")} ${new Date(data.myDown).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()} · ${downOthers.length ? `${downOthers.length} ${t("others too")}` : t("we'll tell whoever's down next")}`
                : downOthers.length ? `${downOthers.slice(0, 2).map((p) => p.first).join(", ")}${downOthers.length > 2 ? ` +${downOthers.length - 2}` : ""} ${t("down right now")}` : t("for 3 hours. people here who are down get a ping")}
            </p>
          </div>
          <button
            onClick={toggleDown}
            disabled={downBusy}
            role="switch"
            aria-checked={!!data.myDown}
            aria-label={t("down to hang")}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${data.myDown ? "bg-ink" : "bg-line"}`}
          >
            <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 34 }} className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${data.myDown ? "right-0.5" : "left-0.5"}`} />
          </button>
        </div>
        {downOthers.length > 0 && (
          <div className="-mt-1 mb-3 flex gap-3 overflow-x-auto border-b border-line/70 pb-3 [scrollbar-width:none]">
            {downOthers.map((p) => (
              <div key={p.memberNo} className="flex w-14 shrink-0 flex-col items-center gap-1 text-center">
                <Face p={p} size="h-11 w-11" />
                <span className="w-full truncate text-[11px] font-bold">{p.first}</span>
              </div>
            ))}
          </div>
        )}
        {data.myOut ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-bold">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#5fd35f] align-middle" />
              {t("you're out in")} {data.myOut.area} · {t("until")} {outEnds}
            </p>
            <button onClick={async () => { await post({ action: "out", off: true }); load() }} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-bold text-ink-soft">
              {t("stop")}
            </button>
          </div>
        ) : outOpen ? (
          <div className="flex gap-2">
            <input
              name="out-area"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goOut()}
              autoFocus
              maxLength={40}
              placeholder={city === "medellin" ? t("neighborhood, like provenza") : t("which neighborhood?")}
              className="w-full rounded-full border border-line bg-white px-3.5 py-2 text-[14px] font-semibold outline-none focus:border-ink"
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
                className={`rounded-full border px-3 py-1 text-[12px] font-bold ${until === k ? "border-transparent bg-ink text-cream" : "border-line bg-white text-ink-soft"}`}
              >
                {label}
              </button>
            ))}
            <span className="w-full pt-0.5 text-[11.5px] text-ink-soft">{t("visible to")} {cityName} {t("members, and posted once in the")} {cityName} {t("chat")}</span>
          </div>
        )}
        {!data.myOut && !outOpen && (
          <button onClick={() => setOutOpen(true)} className="flex w-full items-center justify-center gap-2 text-[14px] font-bold">
            <MapPin size={17} weight="fill" /> {t("i'm out now, come find me")}
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
      )}

      {sections.map((sec) => (
      <div key={sec.key}>
      {sec.label && sec.list.length > 0 && (
        <p className="mt-6 text-[12px] text-ink-soft font-semibold">{sec.label}</p>
      )}
      <MoreList
        items={sec.list}
        step={6}
        resetKey={`${mood}-${needle}-${night}`}
        wrap={(kids) => <div className="mt-4 space-y-5">{kids}</div>}
        render={(s, i) => (
          <motion.article
            key={s.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 6) * 0.04 }}
            onClick={() => setOpenId(s.id)}
            className="cursor-pointer"
          >
            <div className="lift relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-cream-deep">
              {s.photos[0] ? (
                <img src={s.photos[0]} alt="" loading="lazy" className={`h-full w-full object-cover ${s.openNow === false ? "opacity-50 grayscale" : ""}`} />
              ) : (
                // no photo yet: a clean typographic cover instead of an emoji
                <div className="flex h-full w-full items-start bg-gradient-to-br from-[#e9e0d6] to-[#d8cdc1] p-5">
                  <span className="display text-[44px] font-bold leading-none text-ink/15">{s.name}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                {s.openNow === false && <span className="rounded-full bg-ink/85 px-2.5 py-1 text-[11.5px] font-bold text-cream">{t("closed now")}</span>}
                {s.partner && <span className="flex items-center gap-1 rounded-full bg-lime px-2.5 py-1 text-[11.5px] font-bold text-ink"><Gift size={12} weight="fill" /> {s.partner.perk}</span>}
                {s.imGoing && <span className="rounded-full bg-lime px-2.5 py-1 text-[11.5px] font-bold text-ink">✓ {t("you're going")}</span>}
                {s.going > 0 && (
                  <span className="rounded-full bg-cream/95 px-2.5 py-1 text-[11.5px] font-bold">
                    {s.going} {s.imGoing ? t("others going") : t("from irlpass going")}
                  </span>
                )}
                {s.openNow && s.openUntil && <span className="rounded-full bg-cream/90 px-2.5 py-1 text-[11.5px] font-semibold">{t("open til")} {s.openUntil}</span>}
                {s.isNew && <span className="rounded-full bg-peach px-2.5 py-1 text-[11.5px] font-bold text-ink">{s.pending ? t("new · in review") : t("new")}</span>}
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4 text-cream">
                <p className="text-[12px] text-cream/80 font-semibold">
                  {[s.category || s.kind, s.area].filter(Boolean).join(" · ")}
                </p>
                <h3 className="display mt-0.5 text-[27px] font-bold leading-[0.95] tracking-tight">{s.name}</h3>
                {s.groupSpend > 0 && <p className="mt-1 text-[11.5px] font-bold text-lime">{t("irlpass groups spent")} ~${Math.round(s.groupSpend)} {t("pp")}</p>}
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
        )}
      />
      </div>
      ))}
      {spots.length === 0 && !extra.length && !cityEmpty && (
        <div className="py-6 text-center">
          <p className="text-[13px] text-ink-soft">{needle ? t("no spots match that") : budgetLvl ? t("nothing in that price range for this mood") : t("no spots for this mood yet")}</p>
          <button onClick={() => setAddOpen(true)} className="mt-2 text-[13px] font-bold underline underline-offset-2">{t("add one")}</button>
        </div>
      )}

      {/* not on the guide? any bar, club or cafe in town, straight from the map */}
      {needle && (extra.length > 0 || gPlaces?.length > 0) && (
        <section className="mt-6">
          <p className="text-[12px] text-ink-soft font-semibold">{t("anywhere else in")} {cityName}</p>
          <div className="mt-2 space-y-2">
            {[...(gPlaces || []), ...extra.filter((p) => !(gPlaces || []).some((g) => g.name.toLowerCase() === p.name.toLowerCase()))].map((p) => (
              <motion.div
                key={p.osmId}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-[1.3rem] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_20px_-12px_rgba(58,50,44,0.3)]"
              >
                <span className="text-[24px] leading-none">{MOODS.find((m) => m.key === p.mood)?.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold leading-tight">{p.name}</p>
                  <p className="truncate text-[12px] text-ink-soft">{[String(p.kind || "").replace(/_/g, " "), String(p.area || "").toLowerCase(), p.google ? "google maps" : ""].filter(Boolean).join(" · ")}</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => addPlace(p)}
                  disabled={busy === p.osmId}
                  className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-bold text-cream disabled:opacity-50"
                >
                  {busy === p.osmId ? <CircleNotch size={14} className="animate-spin" /> : t("i'm going")}
                </motion.button>
              </motion.div>
            ))}
          </div>
          <p className="mt-2 text-center text-[11.5px] text-ink-soft">{t("it shows up on the guide for everyone while someone's going")}</p>
        </section>
      )}
      {needle.length >= 2 && gPlaces === null && (
        <button
          onClick={searchGoogle}
          disabled={gBusy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white/70 py-3 text-[13px] font-bold text-ink-soft disabled:opacity-70"
        >
          {gBusy ? <><CircleNotch size={15} className="animate-spin" /> {t("searching google maps…")}</> : <>🔎 {t("not here? search google maps")}</>}
        </button>
      )}
      {gPlaces?.length === 0 && <p className="mt-3 text-center text-[12.5px] text-ink-soft">{t("google maps has nothing by that name in")} {cityName}</p>}
      {gErr && <p className="mt-3 text-center text-[12.5px] font-semibold text-[#b3461f]">{gErr}</p>}

      <AnimatePresence>
        {addOpen && (
          <AddSpot
            token={token}
            city={city}
            cityName={data.cityName}
            center={data.center}
            mood={mood}
            onClose={() => setAddOpen(false)}
            onAdded={load}
            onOpenSpot={(id) => { setAddOpen(false); setOpenId(id) }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {invite && <InvitePrompt me={me} spot={invite.spot} when={invite.when} onClose={() => { setInvite(null); setTimeout(() => askPush(t("people join your plan")), 600) }} />}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <SpotSheet
            s={open}
            token={token}
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
