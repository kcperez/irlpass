import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  CalendarPlus, CheckCircle, CircleNotch, LockSimple,
  Plus, Trash, X,
} from "@phosphor-icons/react"
import { CITY_INDEX, cityChip, searchCities, slugify } from "../lib/cities"
import { t } from "../lib/i18n"
import RangePicker from "../components/RangePicker"

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
        <img src={photo} alt="" className={`h-full w-full object-cover ${locked ? "blur-[6px]" : ""}`} />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-ink-soft ${locked ? "blur-[5px]" : ""}`}>
          {letter}
        </div>
      )}
    </div>
  )
}

function PersonRow({ p, onMessage, cityLabel }) {
  return (
    <div className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
      <Initials name={p.name || p.first} photo={p.photo} locked={p.locked} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-[15px] font-semibold ${p.locked ? "blur-[4px] select-none" : ""}`}>
            {p.locked ? `${p.first} ${"•".repeat(6)}` : p.name || p.first}
          </span>
          {p.verified && <CheckCircle size={15} weight="fill" className="shrink-0 text-lime-deep" />}
          {p.local && (
            <span className="shrink-0 rounded-full bg-peach px-2 py-0.5 text-[10px] font-bold">
              {cityLabel} {t("local")}
            </span>
          )}
        </div>
        <p className="truncate text-[12px] text-ink-soft">
          {fmtRange(p.starts, p.ends)}
          {p.flexible && !p.local ? " · flexible" : ""}
          {p.note ? ` · ${p.note}` : p.interests?.length ? ` · ${p.interests.slice(0, 2).join(", ")}` : ""}
        </p>
      </div>
      {p.locked || (!p.canMessage && !p.womenOnly) ? (
        <LockSimple size={17} weight="fill" className="shrink-0 text-ink-soft/50" />
      ) : p.canMessage ? (
        <button
          onClick={() => onMessage(p)}
          className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-cream"
        >
          say hi
        </button>
      ) : (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-soft/60">women only</span>
      )}
    </div>
  )
}

function DateForm({ token, defaultCity, prefillMonth, onPosted, onClose }) {
  const [city, setCity] = useState(defaultCity || "medellin")
  const [typed, setTyped] = useState("")
  const [locating, setLocating] = useState(false)
  const [starts, setStarts] = useState(todayIso())
  const [ends, setEnds] = useState(addDays(todayIso(), prefillMonth ? 29 : 6))
  const [flexible, setFlexible] = useState(false)
  const [local, setLocal] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const submit = async () => {
    setBusy(true)
    setErr("")
    try {
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, city, starts, ends, flexible, note, local }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "could not save your dates")
      onPosted(d)
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
      className="absolute inset-0 z-30 bg-ink/40 backdrop-blur-[2px]"
    />
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="absolute inset-x-0 bottom-0 z-40 max-h-[86%] overflow-y-auto rounded-t-[1.75rem] border-t-2 border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="display text-[20px]">your dates</h2>
        <button onClick={onClose} aria-label="close"><X size={20} className="text-ink-soft" /></button>
      </div>

      <label htmlFor="trip-city" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">city</label>
      <input
        id="trip-city"
        value={typed}
        onChange={(e) => { setTyped(e.target.value); const s = slugify(e.target.value); if (s) setCity(s) }}
        autoComplete="off"
        placeholder={t("type any city")}
        className="mb-2 mt-1.5 w-full rounded-[1.2rem] border-2 border-line bg-white/70 px-4 py-3 text-[16px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
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
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-[1.2rem] border-2 border-dashed border-line py-2.5 text-[13px] font-bold text-ink-soft"
      >
        {locating ? t("finding you…") : t("📍 use my location")}
      </button>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(typed.trim()
          ? (() => {
              const found = searchCities(typed)
              const slug = slugify(typed)
              // a city we don't know yet still gets a button, with a pin
              return slug && !found.some((c) => c.slug === slug)
                ? [cityChip(slug, typed), ...found].slice(0, 6)
                : found
            })()
          : CITIES
        ).map((c) => (
          <button
            key={c.slug}
            onClick={() => { setCity(c.slug); setTyped(c.name) }}
            className={`rounded-full border-2 px-3.5 py-2 text-[13px] font-semibold ${
              city === c.slug ? "border-ink bg-lime text-ink" : "border-line bg-white/60 text-ink-soft"
            }`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      <RangePicker
        starts={starts}
        ends={ends}
        onChange={({ starts: s, ends: e }) => { setStarts(s); setEnds(e || s) }}
      />

      <button
        onClick={() => setLocal((l) => !l)}
        className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-[14px] font-medium ${
          local ? "border-ink bg-lime/60" : "border-line bg-white/60 text-ink-soft"
        }`}
      >
        {t("i live here")}
        <span className={`h-5 w-9 rounded-full ${local ? "bg-ink" : "bg-line"} relative`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-cream transition-all ${local ? "left-[1.15rem]" : "left-0.5"}`} />
        </span>
      </button>

      <button
        onClick={() => setFlexible((f) => !f)}
        className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-[14px] font-medium ${
          flexible ? "border-ink bg-lime/60" : "border-line bg-white/60 text-ink-soft"
        }`}
      >
        i'm flexible on these dates
        <span className={`h-5 w-9 rounded-full ${flexible ? "bg-ink" : "bg-line"} relative`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-cream transition-all ${flexible ? "left-[1.15rem]" : "left-0.5"}`} />
        </span>
      </button>

      <input
        id="trip-note" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)}
        placeholder="what you're up for. surf, coffee, gym…"
        className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-4 py-3 text-[15px] placeholder:text-ink-soft/50"
      />

      {err && <p className="mt-3 text-[13px] text-[#8f2b2b]">{err}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-semibold text-cream disabled:opacity-60"
      >
        {busy ? <CircleNotch size={18} className="animate-spin" /> : <CalendarPlus size={18} weight="fill" />}
        post my dates
      </button>
      <p className="mt-2 text-center text-[11px] text-ink-soft">
        anyone already there on those days gets told you're coming
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
        className="absolute inset-x-0 bottom-0 z-50 max-h-[88%] overflow-y-auto rounded-t-[1.75rem] border-t-2 border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        <h2 className="display text-[22px] font-bold leading-tight">{t("invite someone to these dates")}</h2>
        <p className="mt-1 text-[13px] text-ink-soft">
          {t("they get your dates already filled in, so they're on the calendar in two taps.")}
        </p>

        <div className="mt-4 rounded-[1.4rem] border-2 border-line bg-white/80 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("what they'll get")}</p>
          <p className="mt-2 text-[14px] leading-snug">{text}</p>
          <p className="mt-2 break-all text-[12px] text-ink-soft">{url}</p>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={copy} className="flex-1 rounded-full border-2 border-line py-3.5 text-[14px] font-bold">
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

export default function Trips({ token, me, onOpenDM, unlockRequest, closeSheets, postCity }) {
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
  const [prefillMonth] = useState(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("post") === "month"
  )

  const load = useCallback(async () => {
    const r = await fetch(`/api/trips?t=${token}`)
    const d = await r.json()
    setTrips(d.trips || [])
    setState("ok")
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
  useEffect(() => { if (postCity) setFormOpen(true) }, [postCity])

  // the dm screen bounced someone off the paywall: open the sheet here
  useEffect(() => { if (unlockRequest) setUnlockOpen(true) }, [unlockRequest])

  // only one sheet at a time: the profile sheet closes these
  useEffect(() => {
    if (!closeSheets) return
    setFormOpen(false)
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
  }, [token, trip?.id, justUnlocked]) // eslint-disable-line react-hooks/exhaustive-deps

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



        {/* my trips */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">your dates</h2>
            <button onClick={() => setFormOpen(true)} className="flex items-center gap-1 text-[13px] font-semibold">
              <Plus size={14} weight="bold" /> add
            </button>
          </div>

          {trips.length === 0 ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setFormOpen(true)}
              className="flex w-full items-center gap-3 rounded-[1.75rem] border-2 border-ink bg-lime px-5 py-5 text-left"
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
                  className={`shrink-0 rounded-[1.4rem] border-2 px-4 py-3 text-left ${
                    i === active ? "border-ink bg-lime/60" : "border-line bg-white/60"
                  }`}
                >
                  <span className="block text-[14px] font-semibold">{cityName(t.city)}</span>
                  <span className="block text-[12px] text-ink-soft">{fmtRange(t.starts, t.ends)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* who overlaps */}
        {trip && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                {cityName(trip.city)} · {fmtRange(trip.starts, trip.ends)}
              </h2>
              <button
                onClick={() => removeTrip(trip.id)}
                className="flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold text-ink-soft"
              >
                <Trash size={13} weight="bold" /> {t("remove")}
              </button>
            </div>

            {!overlap ? (
              <div className="flex justify-center py-10"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
            ) : overlap.count === 0 ? (
              <div className="rounded-[1.75rem] border-2 border-line bg-white/60 px-5 py-6 text-center">
                <img src="/art/icon-people.png" alt="" className="mx-auto h-20 w-20 object-contain" draggable="false" />
                <p className="display mt-1 text-[20px] font-bold">nobody yet</p>
                <p className="mt-1 text-[13px] text-ink-soft">we'll ping you the second someone lands on your dates</p>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="display text-[42px] font-bold leading-none">{overlap.count}</span>
                  <span className="text-[14px] text-ink-soft">
                    {overlap.count === 1 ? "person" : "people"} here on your dates
                    {overlap.women > 0 && ` · ${overlap.women} ${overlap.women === 1 ? "woman" : "women"}`}
                  </span>
                </div>

                <div className="overflow-hidden rounded-[1.75rem] border-2 border-line bg-white/70">
                  {overlap.people.map((p) => (
                    <PersonRow
                      key={`${p.memberNo}-${p.starts}`}
                      p={p}
                      cityLabel={cityName(trip.city).toLowerCase()}
                      onMessage={(person) => onOpenDM({ memberNo: person.memberNo, name: person.name, ig: person.ig, photo: person.photo })}
                    />
                  ))}
                </div>

                {lockedCount > 0 && (
                  <button
                    onClick={() => setUnlockOpen(true)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[15px] font-semibold text-cream"
                  >
                    <LockSimple size={16} weight="fill" />
                    message {lockedCount === overlap.count ? "them" : `the other ${lockedCount}`} · $19
                  </button>
                )}
                <button
              onClick={() => setInviteOpen(true)}
              className="mt-3 flex w-full items-center gap-3 rounded-[1.5rem] border-2 border-dashed border-lime-deep bg-lime/25 px-4 py-3.5 text-left"
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

            {overlap.access && (
                  <p className="mt-3 text-center text-[12px] text-ink-soft">
                    {overlap.access === "pass" && "you have the pass · every city, every trip"}
                    {overlap.access === "unlock" && "these dates are unlocked"}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {formOpen && (
          <DateForm
            token={token}
            defaultCity={postCity || me?.city}
            prefillMonth={prefillMonth}
            onClose={() => setFormOpen(false)}
            onPosted={() => {
              setFormOpen(false)
              setActive(0)
              load()
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inviteOpen && trip && <InviteSheet me={me} trip={trip} onClose={() => setInviteOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {unlockOpen && trip && (
          <UnlockSheet
            token={token}
            trip={trip}
            count={overlap?.count || 0}
            onClose={() => setUnlockOpen(false)}
            onDone={() => setUnlockOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
