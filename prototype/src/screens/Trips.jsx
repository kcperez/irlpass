import { useCallback, useEffect, useMemo, useState } from "react"
import { cachedJson } from "../lib/cached"
import { AnimatePresence, motion } from "framer-motion"
import {
  CalendarPlus, CheckCircle, CircleNotch, LockSimple,
  PencilSimple, Plus, Trash, X, EyeSlash } from "@phosphor-icons/react"
import { CITY_INDEX, cityChip, rememberCity } from "../lib/cities"
import { useCitySearch } from "../lib/useCitySearch"
import { t } from "../lib/i18n"
import RightNow from "../components/RightNow"
import CityBrief from "../components/CityBrief"
import { MoreList } from "../lib/more"
import RangePicker from "../components/RangePicker"
import { joinVibes } from "../lib/vibes"
import { countryOf } from "../lib/countries"
import HomeScreenCard from "../components/HomeScreenCard"

// v2: the calendar is the product. post your dates, see who overlaps them,
// pay once to start conversations with them.

const CITIES = ["medellin", "cdmx", "miami", "lisboa", "bali"].map((slug) => CITY_INDEX.find((c) => c.slug === slug))
const cityName = (slug) => cityChip(slug).name

const iso = (d) => d.toISOString().slice(0, 10)
const todayIso = () => iso(new Date())
const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const fmt = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const fmtRange = (a, b) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`)

function Initials({ name, photo, locked, size = "h-11 w-11" }) {
  const letter = String(name || "?").trim()[0]?.toUpperCase() || "?"
  return (
    <div className={`relative ${size} shrink-0 overflow-hidden rounded-full bg-cream-deep`}>
      {photo ? (
        <img src={photo} alt="" className={`h-full w-full object-cover ${locked ? "scale-105 blur-[2.5px]" : ""}`} />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-ink-soft ${locked ? "blur-[5px]" : ""}`}>
          {letter}
        </div>
      )}
    </div>
  )
}

function PersonRow({ p, onMessage, onOpen, cityLabel, viewerIsMan }) {
  return (
    <div className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
      <button onClick={() => onOpen?.(p.memberNo)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <Initials name={p.name || p.first} photo={p.photo} locked={p.locked && !p.faceOpen} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{p.locked ? p.first : p.name || p.first}</span>
          {p.verified && <CheckCircle size={15} weight="fill" className="shrink-0 text-lime-deep" />}
          {p.hereNow && !p.local && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#e8f6e8] px-2 py-0.5 text-[10px] font-bold text-[#2f7a2f]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4a66ff]" />
              {t("here now")}
            </span>
          )}
          {p.local && (
            <span className="shrink-0 rounded-full bg-peach px-2 py-0.5 text-[10px] font-bold">
              {cityLabel} {t("local")}
            </span>
          )}
        </div>
        {p.shared?.length > 0 && (
          <p className="mt-0.5 w-fit max-w-full truncate rounded-full bg-lime px-2 py-0.5 text-[10.5px] font-bold">
            {t("you're both into")} {joinVibes(p.shared)}
          </p>
        )}
        <p className="truncate text-[12px] text-ink-soft">
          {countryOf(p.country) ? `${countryOf(p.country).flag} ${countryOf(p.country).label} · ` : ""}
          {fmtRange(p.starts, p.ends)}
          {p.flexible && !p.local ? " · flexible" : ""}
          {p.area ? ` · 📍 ${p.area}` : ""}
          {p.note ? ` · ${p.note}` : p.interests?.length ? ` · ${p.interests.slice(0, 2).join(", ")}` : ""}
        </p>
      </div>
      </button>
      {!(p.womenOnly && viewerIsMan) ? (
        <button
          onClick={() => onMessage(p)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${p.talked ? "border border-line bg-white" : "bg-ink text-cream"}`}
        >
          {p.unread > 0 ? `${p.unread} ${t("new")}` : t("join their trip")}
        </button>
      ) : (
        <span className="shrink-0 text-[12px] text-ink-soft/60 font-semibold">{t("women only")}</span>
      )}
    </div>
  )
}

// the next four months, for people who know the month but not the days
const MONTHS = (() => {
  const now = new Date()
  return Array.from({ length: 4 }, (_, i) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 0))
    return {
      key: iso(first).slice(0, 7),
      label: first.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" }).toLowerCase(),
      s: iso(first) < todayIso() ? todayIso() : iso(first),
      e: iso(last),
    }
  })
})()

// posting and editing share one form. `trip` set = editing that trip.
function DateForm({ token, defaultCity, prefillMonth, trip, onPosted, onClose }) {
  const editing = !!trip
  const [city, setCity] = useState(trip?.city || defaultCity || "medellin")
  const [typed, setTyped] = useState(trip ? cityName(trip.city) : "")
  const [locating, setLocating] = useState(false)
  const found = useCitySearch(typed && typed !== cityName(city) ? typed : "")
  // exact days are the default and nothing is preselected: a range someone
  // skims past is how wrong dates were getting posted
  const [mode, setMode] = useState(trip?.local ? "local" : prefillMonth ? "month" : "exact") // exact | month | local
  const [month, setMonth] = useState(null)
  const [starts, setStarts] = useState(trip?.starts || null)
  const [ends, setEnds] = useState(trip?.ends || null)
  const [flexible, setFlexible] = useState(!!trip?.flexible)
  const local = mode === "local"
  const [note, setNote] = useState(trip?.note || "")
  const [area, setArea] = useState(trip?.area || "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const ready = !!starts && !!ends && ends >= starts

  const submit = async () => {
    if (!ready) return setErr(t("pick your dates"))
    setBusy(true)
    setErr("")
    try {
      const r = await fetch("/api/trips", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, id: trip?.id, city, starts, ends, flexible, note, local, area }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "could not save your dates")
      onPosted(d)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  const chip = (active) =>
    `rounded-full border px-3.5 py-2 text-[13px] font-bold ${active ? "border-ink bg-white/90 text-ink" : "border-line bg-white/60 text-ink-soft"}`

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-30 bg-ink/40 backdrop-blur-[2px]"
    />
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="absolute inset-x-0 bottom-0 z-40 max-h-[86%] overflow-y-auto rounded-t-[1.75rem] border-t border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="display text-[20px]">{editing ? t("edit your dates") : t("your dates")}</h2>
        <button onClick={onClose} aria-label="close"><X size={20} className="text-ink-soft" /></button>
      </div>

      <label htmlFor="trip-city" className="text-[12px] text-ink-soft font-semibold">city</label>
      <input
        id="trip-city"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        placeholder={t("search a city")}
        className="mb-2 mt-1.5 w-full rounded-[1.2rem] border border-line bg-white/70 px-4 py-3 text-[16px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
      />
      <button
        onClick={() => {
          if (!navigator.geolocation) return
          setLocating(true)
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              try {
                const r = await fetch(`/api/where?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`)
                const d = await r.json()
                if (d.slug) { setCity(d.slug); setTyped(d.name) }
              } finally { setLocating(false) }
            },
            () => setLocating(false),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
          )
        }}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-[1.2rem] border border-line py-2.5 text-[13px] font-bold text-ink-soft"
      >
        {locating ? t("finding you…") : t("📍 use my location")}
      </button>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(typed.trim() && typed !== cityName(city) ? found.results : CITIES).map((c) => (
          <button
            key={c.slug}
            onClick={() => { rememberCity(c); setCity(c.slug); setTyped(c.name) }}
            className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold ${ city === c.slug ? "border-transparent bg-ink text-cream text-ink" : "border-line bg-white/60 text-ink-soft" }`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>
      {found.none && (
        <p className="-mt-1 mb-3 text-[12.5px] font-semibold text-ink-soft">{t("no city by that name. try the full name, like coimbatore or los angeles.")}</p>
      )}

      {mode === "exact" && (
        <RangePicker
          starts={starts}
          ends={ends}
          onChange={({ starts: s, ends: e }) => { setStarts(s); setEnds(e) }}
        />
      )}

      {mode === "month" && (
        <div className="grid grid-cols-2 gap-2">
          {MONTHS.map((m) => (
            <button
              key={m.key}
              onClick={() => { setMonth(m.key); setStarts(m.s); setEnds(m.e); setFlexible(true) }}
              className={`rounded-[1.2rem] border px-4 py-3 text-[15px] font-bold ${month === m.key ? "border-transparent bg-ink text-cream" : "border-line bg-white/70 text-ink-soft"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {mode === "local" && (
        <div className="rounded-[1.4rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-4 py-3">
          <p className="text-[14.5px] font-bold">{t("you live here")}</p>
          <p className="mt-0.5 text-[12.5px]">
            {t("you'll show up for anyone landing here through")} {fmt(ends)}. {t("we'll check in before then.")}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {mode !== "exact" && (
          <button onClick={() => { setMode("exact"); setStarts(null); setEnds(null); setFlexible(false); setMonth(null) }} className={chip(true)}>
            📅 {t("pick exact dates")}
          </button>
        )}
        {mode !== "month" && (
          <button onClick={() => { setMode("month"); setStarts(null); setEnds(null); setMonth(null) }} className={chip(false)}>
            {t("not sure of the days? just the month")}
          </button>
        )}
        {mode !== "local" && (
          <button onClick={() => { setMode("local"); setStarts(todayIso()); setEnds(addDays(todayIso(), 89)); setFlexible(true) }} className={chip(false)}>
            🏠 {t("i live here")}
          </button>
        )}
      </div>

      {mode === "exact" && ready && (
        <button
          onClick={() => setFlexible((f) => !f)}
          className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-[14px] font-medium ${ flexible ? "border-transparent bg-ink text-cream" : "border-line bg-white/60 text-ink-soft" }`}
        >
          {t("i'm flexible on these dates")}
          <span className={`h-5 w-9 rounded-full ${flexible ? "bg-ink" : "bg-line"} relative`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-cream transition-all ${flexible ? "left-[1.15rem]" : "left-0.5"}`} />
          </span>
        </button>
      )}

      <input
        id="trip-area" value={area} maxLength={40} onChange={(e) => setArea(e.target.value)}
        placeholder={t("roughly where you're staying. el poblado, laureles… (optional)")}
        className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-4 py-3 text-[15px] placeholder:text-ink-soft/50"
      />
      <p className="mt-1 px-1 text-[11px] text-ink-soft">{t("neighborhood only, never your address. only people you can message see it.")}</p>

      <input
        id="trip-note" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)}
        placeholder={t("what you're up for. surf, coffee, gym…")}
        className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-4 py-3 text-[15px] placeholder:text-ink-soft/50"
      />

      {err && <p className="mt-3 text-[13px] text-[#8f2b2b]">{err}</p>}

      <button
        onClick={submit}
        disabled={busy || !ready}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-semibold text-cream disabled:opacity-40"
      >
        {busy ? <CircleNotch size={18} className="animate-spin" /> : <CalendarPlus size={18} weight="fill" />}
        {!ready
          ? t("pick your dates")
          : editing
            ? `${t("save")} · ${cityName(city)} ${fmtRange(starts, ends)}`
            : `${t("post")} ${cityName(city)} · ${fmtRange(starts, ends)}`}
      </button>
      <p className="mt-2 text-center text-[11px] text-ink-soft">
        {t("anyone already there on those days gets told you're coming")}
      </p>
    </motion.div>
    </>
  )
}

function InviteSheet({ me, trip, onClose }) {
  const [copied, setCopied] = useState(false)
  const url = `https://irlpass.xyz/?screen=join&city=${trip.city}&starts=${trip.starts}&ends=${trip.ends}&by=${String(me?.ig || "").replace(/^@/, "")}`
  const text = `i'm in ${cityName(trip.city)} ${fmtRange(trip.starts, trip.ends)}. put your dates in and we'll see who else is around`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch { /* clipboard blocked */ }
  }

  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: "irlpass", text, url }); else copy() }
    catch { /* share sheet dismissed */ }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="absolute inset-x-0 bottom-0 z-50 max-h-[88%] overflow-y-auto rounded-t-[1.75rem] border-t border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        <h2 className="display text-[22px] font-bold leading-tight">{t("invite someone to these dates")}</h2>
        <p className="mt-1 text-[13px] text-ink-soft">
          {t("they get your dates already filled in, so they're on the calendar in two taps.")}
        </p>

        <div className="mt-4 rounded-[1.4rem] border border-line bg-white/80 p-4">
          <p className="text-[12px] text-ink-soft font-semibold">{t("what they'll get")}</p>
          <p className="mt-2 text-[14px] leading-snug">{text}</p>
          <p className="mt-2 break-all text-[12px] text-ink-soft">{url}</p>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={copy} className="flex-1 rounded-full border border-line py-3.5 text-[14px] font-bold">
            {copied ? t("link copied") : t("copy link")}
          </button>
          <button onClick={share} className="flex-1 rounded-full bg-ink py-3.5 text-[14px] font-bold text-cream">
            {t("share")}
          </button>
        </div>
        <button onClick={onClose} className="mt-2 w-full py-2 text-center text-[13px] text-ink-soft underline">
          {t("close")}
        </button>
      </motion.div>
    </>
  )
}

function UnlockSheet({ token, trip, count, onClose, onDone }) {
  const [plan, setPlan] = useState("trip")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const go = async () => {
    setBusy(true)
    setErr("")
    try {
      const r = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, city: trip.city, starts: trip.starts, ends: trip.ends, plan }),
      })
      const d = await r.json()
      if (!r.ok || !d.url) throw new Error(d.error || "checkout unavailable")
      window.location.href = d.url
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="absolute inset-x-0 bottom-0 z-50 rounded-t-[1.75rem] border-t border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        <h2 className="display text-[22px] leading-tight">
          message {count === 1 ? "the person" : `all ${count} people`} on your dates
        </h2>
        <p className="mt-1 text-[13px] text-ink-soft">
          {cityName(trip.city)} · {fmtRange(trip.starts, trip.ends)}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setPlan("trip")}
            className={`flex-1 rounded-2xl border p-4 text-left ${plan === "trip" ? "border-ink bg-lime/50" : "border-line bg-white/60"}`}
          >
            <span className="display block text-[26px] leading-none">$19</span>
            <span className="mt-1.5 block text-[12px] text-ink-soft">
              this trip<br />{cityName(trip.city)}, {fmtRange(trip.starts, trip.ends)}
            </span>
          </button>
          <button
            onClick={() => setPlan("pass")}
            className={`flex-1 rounded-2xl border p-4 text-left ${plan === "pass" ? "border-ink bg-lime/50" : "border-line bg-white/60"}`}
          >
            <span className="display block text-[26px] leading-none">$29<span className="text-[13px]">/mo</span></span>
            <span className="mt-1.5 block text-[12px] text-ink-soft">
              every trip<br />any city, any dates
            </span>
          </button>
        </div>

        {err && <p className="mt-3 text-[13px] text-[#8f2b2b]">{err}</p>}

        <button
          onClick={go}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-semibold text-cream disabled:opacity-60"
        >
          {busy ? <CircleNotch size={18} className="animate-spin" /> : null}
          {plan === "pass" ? "get the pass" : "unlock this trip"}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-soft">
          replying is always free · cancel anytime
        </p>
        <button onClick={onDone} className="mt-2 w-full py-2 text-center text-[13px] text-ink-soft underline">
          maybe later
        </button>
      </motion.div>
    </>
  )
}

export default function Trips({ token, me, onOpenDM, onOpenPerson, unlockRequest, closeSheets, postCity, onCityPosted, onPaywall, onJoinTrip, onPostCityUsed }) {
  const [state, setState] = useState("loading")
  const [trips, setTrips] = useState([])
  const [active, setActive] = useState(0) // index of the trip being viewed
  const [overlap, setOverlap] = useState(null)
  const [formOpen, setFormOpen] = useState(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("post") === "month"
  )
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [justUnlocked, setJustUnlocked] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editTrip, setEditTrip] = useState(null) // trip open in the form for editing
  const [prefillMonth] = useState(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("post") === "month"
  )

  const load = useCallback(async () => {
    await cachedJson(`/api/trips?t=${token}`, (d) => { setTrips(d.trips || []); setState("ok") })
      .catch(() => setState("ok"))
  }, [token])

  useEffect(() => { load() }, [load])

  // ?post=month opens the form once; drop it so it can't re-open later
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("post")) {
      p.delete("post")
      window.history.replaceState({}, "", `${window.location.pathname}?${p}`)
    }
  }, [])

  // sent here from a city chat they can't write in yet
  useEffect(() => { if (postCity) { setFormOpen(true); onPostCityUsed?.() } }, [postCity]) // eslint-disable-line react-hooks/exhaustive-deps

  // the dm screen bounced someone off the paywall: open the sheet here
  // (the one paywall lives in Club now: free month, then $19.99)
  useEffect(() => { if (unlockRequest) onPaywall?.({ reason: "dm" }) }, [unlockRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  // only one sheet at a time: the profile sheet closes these
  useEffect(() => {
    if (!closeSheets) return
    setFormOpen(false)
    setEditTrip(null)
    setUnlockOpen(false)
    setInviteOpen(false)
  }, [closeSheets])

  // back from stripe: confirm the payment, then drop the blur
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("unlock") !== "1" || !p.get("session_id")) return
    fetch(`/api/unlock-activate?t=${token}&session_id=${encodeURIComponent(p.get("session_id"))}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setJustUnlocked(true) })
      .catch(() => {})
      .finally(() => {
        window.history.replaceState({}, "", `/?screen=app&t=${token}`)
        load()
      })
  }, [token, load])

  const trip = trips[active] || null

  useEffect(() => {
    if (!trip) return setOverlap(null)
    setOverlap(null)
    fetch(`/api/overlap?t=${token}&city=${trip.city}&starts=${trip.starts}&ends=${trip.ends}`)
      .then((r) => r.json())
      .then(setOverlap)
      .catch(() => setOverlap({ people: [], count: 0 }))
  }, [token, trip?.id, trip?.city, trip?.starts, trip?.ends, justUnlocked]) // eslint-disable-line react-hooks/exhaustive-deps

  const lockedCount = useMemo(() => (overlap?.people || []).filter((p) => p.locked).length, [overlap])

  const removeTrip = async (id) => {
    await fetch(`/api/trips?t=${token}&id=${id}`, { method: "DELETE" })
    setActive(0)
    load()
  }

  if (state === "loading") {
    return <div className="flex flex-1 items-center justify-center"><CircleNotch size={24} className="animate-spin text-ink-soft" /></div>
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-2">



        {/* the daily reason to open the app: what should i do right now? */}
        <RightNow token={token} me={me} onPaywall={onPaywall} trips={trips.map((x) => ({ city: x.city, starts: x.starts, name: cityChip(x.city).name }))} />
        {/* before you land: the stuff you should know about where you're headed */}
        {trips[0] && <CityBrief token={token} city={trips[0].city} starts={trips[0].starts} />}

        {/* my trips */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] text-ink-soft font-semibold">your dates</h2>
            <button onClick={() => setFormOpen(true)} className="flex items-center gap-1 text-[13px] font-semibold">
              <Plus size={14} weight="bold" /> add
            </button>
          </div>

          {trips.length === 0 ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setFormOpen(true)}
              className="flex w-full items-center gap-3 rounded-[1.75rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-5 py-5 text-left"
            >
              <img src="/art/icon-dates.png" alt="" className="h-16 w-16 shrink-0 object-contain" draggable="false" />
              <span className="display text-[22px] font-bold leading-tight">post your dates</span>
            </motion.button>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {trips.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setActive(i)}
                  className={`shrink-0 rounded-[1.4rem] border px-4 py-3 text-left ${ i === active ? "border-transparent bg-ink text-cream" : "border-line bg-white/60" }`}
                >
                  <span className="block text-[14px] font-semibold">{cityName(t.city)}</span>
                  <span className="block text-[12px] text-ink-soft">{fmtRange(t.starts, t.ends)}{t.hidden ? " · 🙈" : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* who overlaps */}
        {trip && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[12px] text-ink-soft font-semibold">
                {cityName(trip.city)} · {fmtRange(trip.starts, trip.ends)}
              </h2>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setEditTrip(trip)}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-bold"
                >
                  <PencilSimple size={13} weight="bold" /> {t("edit")}
                </button>
                {/* hide: the trip stays yours, nobody else sees it (lists, maps, emails) */}
                <button
                  onClick={async () => {
                    await fetch("/api/trips", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ t: token, id: trip.id, hidden: !trip.hidden }),
                    }).catch(() => {})
                    load()
                  }}
                  aria-label={trip.hidden ? t("show this trip") : t("hide this trip")}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-bold ${trip.hidden ? "border-ink bg-ink text-cream" : "border-line text-ink-soft"}`}
                >
                  <EyeSlash size={13} weight="bold" />{trip.hidden ? ` ${t("hidden")}` : ""}
                </button>
                <button
                  onClick={() => { if (confirm(t("remove these dates?"))) removeTrip(trip.id) }}
                  aria-label={t("remove")}
                  className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1.5 text-[12px] font-bold text-ink-soft"
                >
                  <Trash size={13} weight="bold" />
                </button>
              </div>
            </div>

            {trip.hidden && (
              <p className="mb-3 rounded-[1.2rem] bg-cream-deep px-4 py-2.5 text-[12.5px] font-semibold text-ink-soft">
                🙈 {t("only you can see this trip. nobody gets matched to it until you show it again.")}
              </p>
            )}

            {/* this trip came from an old quick-pick button: ask once if it's real */}
            {trip.guess && (
              <div className="mb-3 rounded-[1.5rem] border border-line bg-peach px-4 py-3">
                <p className="text-[14px] font-bold leading-snug">{t("are these your real dates?")}</p>
                <p className="mt-0.5 text-[12.5px]">
                  {cityName(trip.city)} · {fmtRange(trip.starts, trip.ends)}. {t("they came from a quick-pick button, and matches are only as good as your dates.")}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={async () => {
                      await fetch("/api/trips", {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ t: token, id: trip.id, confirm: true }),
                      }).catch(() => {})
                      load()
                    }}
                    className="flex-1 rounded-full bg-ink py-2.5 text-[13px] font-bold text-cream"
                  >
                    {t("yes, these are right")}
                  </button>
                  <button onClick={() => setEditTrip(trip)} className="flex-1 rounded-full border border-line bg-white py-2.5 text-[13px] font-bold">
                    {t("fix them")}
                  </button>
                </div>
              </div>
            )}

            {!overlap ? (
              <div className="flex justify-center py-10"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
            ) : overlap.count === 0 ? (
              <div className="rounded-[1.75rem] border border-line bg-white/60 px-5 py-6 text-center">
                <img src="/art/icon-people.png" alt="" className="mx-auto h-20 w-20 object-contain" draggable="false" />
                <p className="display mt-1 text-[20px] font-bold">{t("no travelers on these dates yet")}</p>
                <p className="mt-1 text-[13px] text-ink-soft">{t("be the one who brings someone. we'll also ping you the second anyone lands on your dates.")}</p>
                {overlap.localsCount > 0 && (
                  <div className="mt-4 border-t border-line/70 pt-4">
                    <p className="text-[13.5px] font-bold">
                      {overlap.localsCount} {overlap.localsCount === 1 ? t("local lives in") : t("locals live in")} {cityName(trip.city)}
                    </p>
                    <div className="mt-2 flex justify-center -space-x-2">
                      {overlap.locals.slice(0, 7).map((p) => (
                        <div key={p.memberNo} className="h-10 w-10 overflow-hidden rounded-full border border-cream bg-cream-deep">
                          {p.photo && (
                            <img src={p.photo} alt="" onError={(e) => { e.currentTarget.style.display = "none" }} className={`h-full w-full object-cover ${p.locked && !p.faceOpen ? "scale-105 blur-[2px]" : ""}`} />
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[12px] text-ink-soft">{t("they're there whenever you land. find them on the people tab.")}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* faces, not just a number: who's actually here on your dates */}
                <div className="mb-2.5 flex items-center gap-3">
                  <div className="flex -space-x-2.5">
                    {overlap.people.filter((p) => p.photo).slice(0, 5).map((p) => (
                      <img key={p.memberNo} src={p.photo} alt="" onError={(e) => { e.currentTarget.style.display = "none" }} className={`h-9 w-9 rounded-full border-2 border-cream object-cover ${p.locked && !p.faceOpen ? "blur-[1.5px]" : ""}`} />
                    ))}
                    {overlap.count > 5 && (
                      <span className="flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-cream bg-ink px-2 text-[11.5px] font-bold text-cream">+{overlap.count - 5}</span>
                    )}
                  </div>
                  <p className="min-w-0 text-[14px] leading-tight text-ink-soft">
                    <span className="font-bold text-ink">{overlap.count} {overlap.count === 1 ? t("person") : t("people")}</span> {t("here on your dates")}
                    {overlap.women > 0 && ` · ${overlap.women} ${overlap.women === 1 ? t("woman") : t("women")}`}
                  </p>
                </div>

                <div className="lift overflow-hidden rounded-[1.75rem] bg-white">
                  <MoreList
                    items={overlap.people}
                    step={10}
                    resetKey={trip?.id}
                    render={(p) => (
                    <PersonRow
                      key={`${p.memberNo}-${p.starts}`}
                      p={p}
                      cityLabel={cityName(trip.city).toLowerCase()}
                      onOpen={onOpenPerson}
                      viewerIsMan={me?.gender === "man"}
                      onMessage={(person) => {
                        // unread? that's a conversation. otherwise: join their trip = a plan
                        // on the nights you overlap (the first one up front)
                        if (person.unread > 0 || !onJoinTrip) return onOpenDM({ memberNo: person.memberNo, name: person.name, ig: person.ig, photo: person.photo })
                        const today = new Date().toISOString().slice(0, 10)
                        const a = [trip.starts, person.starts, today].sort().pop()
                        const b = [trip.ends, person.ends].sort()[0]
                        const nights = []
                        for (let d = new Date(`${a}T00:00:00Z`); d.toISOString().slice(0, 10) <= b && nights.length < 14; d.setUTCDate(d.getUTCDate() + 1)) nights.push(d.toISOString().slice(0, 10))
                        onJoinTrip(person, nights.length ? nights : null, trip.city)
                      }}
                    />
                  )}
                  />
                </div>

                {lockedCount > 0 && (
                  <button
                    onClick={() => onPaywall?.({ reason: "dm" })}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[15px] font-semibold text-cream"
                  >
                    <LockSimple size={16} weight="fill" />
                    {t("meet them")} · {t("first month free")}
                  </button>
                )}
            {overlap.access && (
                  <p className="mt-3 text-center text-[12px] text-ink-soft">
                    {overlap.access === "pass" && "you have the pass · every city, every trip"}
                    {overlap.access === "unlock" && "these dates are unlocked"}
                  </p>
                )}
              </>
            )}

            {/* the growth loop: always there, most of all when you're alone on your dates */}
            {overlap && (
              <button
                onClick={() => setInviteOpen(true)}
                className={`mt-3 flex w-full items-center gap-3 rounded-[1.5rem] border px-4 py-3.5 text-left ${ overlap.count === 0 ? "border-transparent bg-ink text-cream" : "border-lime-deep bg-lime/25" }`}
              >
                <img src="/art/icon-people.png" alt="" className="h-11 w-11 shrink-0 object-contain" draggable="false" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold leading-tight">{t("invite someone to these dates")}</p>
                  <p className="text-[12.5px] text-ink-soft">
                    {cityName(trip.city)} · {fmtRange(trip.starts, trip.ends)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12px] font-bold text-cream">{t("invite")}</span>
              </button>
            )}

            <HomeScreenCard />
          </>
        )}
      </div>

      <AnimatePresence>
        {(formOpen || editTrip) && (
          <DateForm
            key={editTrip?.id || "new"}
            token={token}
            trip={editTrip}
            defaultCity={postCity || me?.city}
            prefillMonth={prefillMonth}
            onClose={() => { setFormOpen(false); setEditTrip(null) }}
            onPosted={(d) => {
              const wasEdit = !!editTrip
              setFormOpen(false)
              setEditTrip(null)
              if (!wasEdit) setActive(0)
              if (d?.trip?.city) onCityPosted?.(d.trip.city)
              load()
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inviteOpen && trip && <InviteSheet me={me} trip={trip} onClose={() => setInviteOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>

      </AnimatePresence>
    </div>
  )
}
