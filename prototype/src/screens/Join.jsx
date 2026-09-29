import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, ArrowRight, CircleNotch, LockSimple } from "@phosphor-icons/react"
import { useEffect } from "react"
import { t } from "../lib/i18n"
import RangePicker from "../components/RangePicker"
import { CITY_INDEX, cityChip, registerCities, rememberCity } from "../lib/cities"
import { useCitySearch } from "../lib/useCitySearch"
import { VIBES, MIN_VIBES, vibeLabel, joinVibes } from "../lib/vibes"

// two taps and you're on the calendar: where + when, then how we reach you.

const QUICK = ["medellin", "cdmx", "miami", "lisboa", "bali"].map((slug) => CITY_INDEX.find((c) => c.slug === slug))

const iso = (d) => d.toISOString().slice(0, 10)
const todayIso = () => iso(new Date())
const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const fmtShort = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

// the next four months as "just the month" choices: first to last day, never before today
const MONTHS = (() => {
  const now = new Date()
  return Array.from({ length: 4 }, (_, i) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 0))
    const s = iso(first) < todayIso() ? todayIso() : iso(first)
    return {
      key: iso(first).slice(0, 7),
      label: first.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" }).toLowerCase(),
      s,
      e: iso(last),
    }
  })
})()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const slide = {
  enter: { opacity: 0, x: 40, scale: 0.98 },
  center: { opacity: 1, x: 0, scale: 1, transition: { type: "spring", stiffness: 190, damping: 24 } },
  exit: { opacity: 0, x: -40, scale: 0.98, transition: { duration: 0.16 } },
}

function CountUp({ to, duration = 900 }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!to) return setN(0)
    // a hidden tab or reduced motion gets the number, not an animation stuck at 0
    if (document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setN(to)
    const t0 = performance.now()
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3)))) // ease out
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, duration])
  return <>{n}</>
}

function Bubble({ active, children, onClick, className = "" }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`rounded-[1.4rem] border-2 px-4 py-3 text-[16px] font-bold transition-colors ${
        active ? "border-ink bg-lime" : "border-line bg-white/70 text-ink-soft"
      } ${className}`}
    >
      {children}
    </motion.button>
  )
}

const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()

export default function Join({ ig, onBack, onDone }) {
  // invited with a city and dates already: go straight to the payoff
  const invited = !!(params.get("by") && params.get("starts") && params.get("ends"))
  // invited with dates already in: they're visiting, skip to "where do you live"
  const [step, setStep] = useState(invited ? 3 : 0)
  const [city, setCity] = useState(params.get("city") || "medellin")
  const [customCity, setCustomCity] = useState("")
  const [flexible, setFlexible] = useState(false)
  // exact days are the default. "month" and "local" are the fallbacks for
  // people who don't know yet or live there.
  const [mode, setMode] = useState("exact") // exact | month | local
  const [stay, setStay] = useState(invited ? "visit" : null) // "live" | "visit": locals are first-class, not an afterthought
  const [month, setMonth] = useState(null)
  const [local, setLocal] = useState(false)
  const [vibes, setVibes] = useState([])
  const [already, setAlready] = useState(false) // handle belongs to an existing member
  // where they live. locals are what fill an empty calendar, so it's asked of everyone
  const [home, setHome] = useState(null) // { slug, name, emoji } | "nomad"
  const [homeTyped, setHomeTyped] = useState("")
  const homeFound = useCitySearch(homeTyped)
  // only real cities: what's typed searches, a tapped result is the city
  const found = useCitySearch(customCity)
  // nothing preselected: a default range someone skims past is how wrong dates got posted
  const [starts, setStarts] = useState(params.get("starts") || null)
  const [ends, setEnds] = useState(params.get("ends") || null)
  const [email, setEmail] = useState("")
  // a real first name: people meet a person, not a handle
  const [firstName, setFirstName] = useState("")
  const [adult, setAdult] = useState(false)
  const [preview, setPreview] = useState(null)
  const [byCity, setByCity] = useState({})

  // live head count per city, so a chip can show what's actually happening
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then((d) => { registerCities(d.cityMeta); setByCity(d.byCity || {}) }).catch(() => {})
  }, [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const submit = async () => {
    setBusy(true)
    setErr("")
    try {
      const r = await fetch("/api/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: firstName.trim() || ig,
          ig: `@${ig}`,
          email: email.trim(),
          adult,
          city,
          dates: `${starts} to ${ends || starts}`,
          interests: vibes,
          homeCity: local ? city : home && home !== "nomad" ? home.slug : null,
        }),
      })
      const d = await r.json()
      if (r.ok && d.emailed) {
        // that instagram already has an account under another email
        setBusy(false)
        setAlready(true)
        return
      }
      if (!r.ok || !d.token) throw new Error(d.error || "something went wrong")
      await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: d.token, city, starts, ends: ends || starts, local, flexible }),
      }).catch(() => {})
      // they live somewhere else: they're a local there, and show up for anyone landing
      if (!local && home && home !== "nomad" && home.slug !== city) {
        await fetch("/api/trips", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ t: d.token, city: home.slug, starts: todayIso(), ends: addDays(todayIso(), 89), local: true, flexible: true }),
        }).catch(() => {})
      }
      localStorage.setItem("irlpass_member_token", d.token)
      onDone(d.token)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  const loadPreview = async () => {
    setPreview("loading")
    try {
      const r = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ city, starts, ends: ends || starts, vibes }),
      })
      setPreview(await r.json())
    } catch {
      setPreview({ count: 0, faces: [], inCity: 0 })
    }
  }

  // invited people land on the reveal, so it has to load itself
  useEffect(() => {
    if (invited) loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const steps = [
    {
      key: "where",
      art: "/art/icon-globe.png",
      title: t("where are you going?"),
      valid: !!city && city.length > 1,
      body: (
        <div className="flex flex-col gap-3">
          <input
            id="join-city"
            value={customCity}
            onChange={(e) => setCustomCity(e.target.value)}
            autoComplete="off"
            placeholder={t("search a city")}
            className="w-full rounded-[1.4rem] border-2 border-line bg-white/70 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
          />

          <div className="flex flex-wrap gap-2">
            {(customCity.trim() ? found.results : QUICK).map((c) => (
              <Bubble
                key={c.slug}
                active={city === c.slug}
                onClick={() => { rememberCity(c); setCity(c.slug); setCustomCity(c.name) }}
              >
                <span className="mr-1.5">{c.emoji}</span>
                {c.name}
                {byCity[c.slug] > 0 && (
                  <span className="relative ml-2 inline-flex h-2 w-2 align-middle">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5fd35f] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#5fd35f]" />
                  </span>
                )}
              </Bubble>
            ))}
          </div>
          {found.loading && found.results.length === 0 && (
            <p className="text-[13px] font-semibold text-ink-soft">{t("searching…")}</p>
          )}
          {found.none && (
            <p className="text-[13px] font-semibold text-ink-soft">{t("no city by that name. try the full name, like coimbatore or los angeles.")}</p>
          )}
        </div>
      ),
    },
    {
      key: "stay",
      art: "/art/icon-people.png",
      title: `${t("you and")} ${cityChip(city, customCity).name}?`,
      valid: !!stay,
      body: (
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ["live", "🏠", t("i live here"), t("you're who travelers get to meet")],
            ["visit", "✈️", t("i'm visiting"), t("pick your dates next")],
          ].map(([k, emoji, label, sub]) => (
            <motion.button
              key={k}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setStay(k)
                if (k === "live") {
                  // a local is there every day: no dates to pick
                  setMode("local"); setStarts(todayIso()); setEnds(addDays(todayIso(), 89)); setFlexible(true); setLocal(true)
                } else if (local) {
                  setMode("exact"); setStarts(null); setEnds(null); setFlexible(false); setLocal(false)
                }
              }}
              className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[1.6rem] border-2 p-3 text-center ${
                stay === k ? "border-ink bg-lime" : "border-line bg-white/70"
              }`}
            >
              <span className="text-[40px] leading-none">{emoji}</span>
              <span className="text-[18px] font-bold leading-tight">{label}</span>
              <span className="text-[12px] leading-tight text-ink-soft">{sub}</span>
            </motion.button>
          ))}
        </div>
      ),
    },
    ...(stay === "live" ? [] : [{
      key: "when",
      art: "/art/icon-dates.png",
      title: t("when?"),
      valid: !!starts && !!ends && ends >= starts,
      body: (
        <div className="flex flex-col gap-3">
          {mode === "exact" && (
            <RangePicker
              starts={starts}
              ends={ends}
              onChange={({ starts: s, ends: e }) => { setStarts(s); setEnds(e); setFlexible(false); setLocal(false) }}
            />
          )}

          {mode === "month" && (
            <div className="grid grid-cols-2 gap-2">
              {MONTHS.map((m) => (
                <Bubble
                  key={m.key}
                  active={month === m.key}
                  onClick={() => { setMonth(m.key); setStarts(m.s); setEnds(m.e); setFlexible(true); setLocal(false) }}
                >
                  {m.label}
                </Bubble>
              ))}
            </div>
          )}

          {mode === "local" && (
            <div className="rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3">
              <p className="text-[15px] font-bold">{t("you live here")}</p>
              <p className="mt-0.5 text-[13px] text-ink">
                {t("you'll show up for anyone landing here through")} {fmtShort(ends)}. {t("we'll check in before then.")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {mode !== "exact" && (
              <button
                onClick={() => { setMode("exact"); setStarts(null); setEnds(null); setFlexible(false); setLocal(false); setMonth(null) }}
                className="rounded-full border-2 border-ink bg-white/80 px-3.5 py-2 text-[13px] font-bold"
              >
                📅 {t("pick exact dates")}
              </button>
            )}
            {mode === "exact" && (
              <button
                onClick={() => { setStarts(todayIso()); setEnds(null) }}
                className="rounded-full border-2 border-line bg-white/70 px-3.5 py-2 text-[13px] font-bold text-ink-soft"
              >
                {t("i'm here now")}
              </button>
            )}
            {mode !== "month" && (
              <button
                onClick={() => { setMode("month"); setStarts(null); setEnds(null); setMonth(null); setLocal(false) }}
                className="rounded-full border-2 border-line bg-white/70 px-3.5 py-2 text-[13px] font-bold text-ink-soft"
              >
                {t("not sure of the days? just the month")}
              </button>
            )}

          </div>

          {starts && ends && mode !== "local" && (
            <p className="text-[14px] font-bold">
              {fmtShort(starts)} → {fmtShort(ends)}
              {flexible && <span className="font-semibold text-ink-soft"> · {t("flexible")}</span>}
            </p>
          )}
        </div>
      ),
    }]),
    ...(local ? [] : [{
      key: "home",
      art: "/art/icon-globe.png",
      title: t("where do you live?"),
      valid: !!home,
      body: (
        <div className="flex flex-col gap-3">
          <p className="-mt-2 text-[14px] text-ink-soft">
            {t("you'll show up for travelers landing in your city, and meet the locals when you travel.")}
          </p>
          {home && home !== "nomad" ? (
            <div className="flex items-center justify-between rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3">
              <span className="text-[17px] font-bold">{home.emoji} {home.name}</span>
              <button onClick={() => { setHome(null); setHomeTyped("") }} className="text-[13px] font-semibold underline">{t("change")}</button>
            </div>
          ) : (
            <>
              <input
                id="join-home"
                value={homeTyped}
                onChange={(e) => { setHomeTyped(e.target.value); if (home === "nomad") setHome(null) }}
                autoComplete="off"
                placeholder={t("search a city")}
                className="w-full rounded-[1.4rem] border-2 border-line bg-white/70 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
              />
              <div className="flex flex-wrap gap-2">
                {homeFound.results.map((c) => (
                  <Bubble key={c.slug} active={false} onClick={() => { rememberCity(c); setHome(c) }}>
                    <span className="mr-1.5">{c.emoji}</span>{c.name}
                  </Bubble>
                ))}
              </div>
              {homeFound.none && (
                <p className="text-[13px] font-semibold text-ink-soft">{t("no city by that name. try the full name, like coimbatore or los angeles.")}</p>
              )}
              <button
                onClick={() => setHome("nomad")}
                className={`w-fit rounded-full border-2 px-3.5 py-2 text-[13px] font-bold ${home === "nomad" ? "border-ink bg-lime" : "border-line bg-white/70 text-ink-soft"}`}
              >
                🎒 {t("i travel full-time")}
              </button>
            </>
          )}
        </div>
      ),
    }]),
    {
      key: "vibes",
      art: "/art/icon-people.png",
      title: t("what's your vibe?"),
      valid: vibes.length >= MIN_VIBES,
      body: (
        <div className="flex flex-col gap-3">
          <p className="-mt-2 text-[14px] text-ink-soft">
            {t("pick at least 3. we put people who like the same things at the top.")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {VIBES.map((v) => {
              const on = vibes.includes(v.key)
              return (
                <motion.button
                  key={v.key}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setVibes((l) => (on ? l.filter((x) => x !== v.key) : [...l, v.key]))}
                  className={`flex aspect-[1/0.9] flex-col items-center justify-center gap-1 rounded-[1.2rem] border-2 px-1 text-center transition-colors ${
                    on ? "border-ink bg-lime" : "border-line bg-white/70"
                  }`}
                >
                  <span className="text-[26px] leading-none">{v.emoji}</span>
                  <span className={`text-[12px] font-bold leading-tight ${on ? "text-ink" : "text-ink-soft"}`}>{vibeLabel(v.key)}</span>
                </motion.button>
              )
            })}
          </div>
          <p className="text-center text-[12.5px] font-semibold text-ink-soft">
            {vibes.length < MIN_VIBES ? `${vibes.length} / ${MIN_VIBES}` : `${vibes.length} ${t("picked")} ✓`}
          </p>
        </div>
      ),
    },
    {
      key: "reveal",
      hideArt: true,
      valid: true,
      body: (
        <div className="flex flex-col gap-4">
          {preview === "loading" || !preview ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <CircleNotch size={26} className="animate-spin text-ink-soft" />
              <p className="text-[14px] text-ink-soft">{t("checking who's there…")}</p>
            </div>
          ) : (
            <>
              {/* never lead with nothing: if no trips overlap, the city's people are the number */}
              <div>
                <p className="display text-[72px] font-bold leading-[0.85] tracking-tight">
                  <CountUp to={preview.count > 0 ? preview.count : preview.inCity} />
                </p>
                <p className="display mt-1 text-[26px] font-bold leading-tight">
                  {preview.count > 0
                    ? preview.count === 1 ? t("person is there on your dates") : t("people are there on your dates")
                    : `${t("people in")} ${preview.cityName}`}
                </p>
                <p className="mt-1.5 text-[14px] text-ink-soft">
                  {preview.count > 0 ? (
                    <>
                      {preview.women > 0 && `${preview.women} ${preview.women === 1 ? t("woman") : t("women")} · `}
                      {preview.men > 0 && `${preview.men} ${preview.men === 1 ? t("man") : t("men")}`}
                      {preview.hereNow > 0 && ` · ${preview.hereNow} ${t("there right now")}`}
                      {preview.sameDay > 0 && ` · ${preview.sameDay} ${t("land the same day as you")}`}
                      {preview.locals > 0 &&
                        ` · ${preview.locals} ${preview.cityName.toLowerCase()} ${preview.locals === 1 ? t("local") : t("locals")}`}
                    </>
                  ) : (
                    <>
                      {t("they're already there. nobody's posted your exact days yet, so you'd be first.")}
                    </>
                  )}
                </p>
              </div>

              {preview.vibeMatches > 0 && (
                <div className="w-fit rounded-full border-2 border-ink bg-lime px-3.5 py-1.5 text-[13px] font-bold">
                  {preview.vibeMatches} {preview.vibeMatches === 1 ? t("of them is into") : t("of them are into")} {joinVibes(preview.topShared || [])}
                </div>
              )}

              {((preview.count > 0 ? preview.faces : preview.cityFaces) || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {((preview.count > 0 ? preview.faces : preview.cityFaces) || []).map((f, i) => (
                    <motion.div
                      key={`${f.first}-${i}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.25 + i * 0.07, type: "spring", stiffness: 220, damping: 18 }}
                      className="relative"
                    >
                      {f.photo ? (
                        <img src={f.photo} alt="" className={`h-14 w-14 rounded-full object-cover ${i > 0 ? "scale-105 blur-[2.5px]" : ""}`} />
                      ) : (
                        <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-cream-deep text-[18px] font-bold ${i > 0 ? "blur-[4px]" : ""}`}>
                          {f.first[0]?.toUpperCase()}
                        </div>
                      )}
                      {i > 0 && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <LockSimple size={15} weight="fill" className="text-ink/70" />
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 rounded-[1.75rem] bg-white/80 p-4">
                <img src="/art/icon-chat.png" alt="" className="h-14 w-14 shrink-0 object-contain" draggable="false" />
                <div className="min-w-0">
                  <p className="display text-[18px] font-bold leading-tight">
                    {preview.count > 0 ? t("message them before you land") : `${preview.cityName} ${t("group chat")}`}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {preview.count > 0
                      ? t("they see your dates, you see theirs, you pick a day.")
                      : t("everyone in town is in it. and we ping you the second someone matches your dates.")}
                  </p>
                </div>
              </div>


            </>
          )}
        </div>
      ),
    },
    {
      key: "you",
      art: "/art/icon-chat.png",
      title: t("almost in. who are you?"),
      valid: EMAIL_RE.test(email.trim()) && adult && firstName.trim().length >= 2,
      body: (
        <div className="flex flex-col gap-2.5">
          <input
            id="join-name" value={firstName} onChange={(e) => setFirstName(e.target.value.slice(0, 30))}
            autoComplete="given-name"
            placeholder={t("your first name")}
            className="w-full rounded-[1.4rem] border-2 border-line bg-white/70 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
          />
          <input
            id="join-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none" autoCorrect="off" spellCheck="false"
            placeholder={t("your email")}
            className="w-full rounded-[1.4rem] border-2 border-line bg-white/70 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
          />
          <button
            onClick={() => setAdult((a) => !a)}
            className={`flex items-center gap-3 rounded-[1.4rem] border-2 px-4 py-3 text-left text-[15px] font-semibold ${
              adult ? "border-ink bg-lime" : "border-line bg-white/70 text-ink-soft"
            }`}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${adult ? "border-ink bg-ink text-cream" : "border-line"}`}>
              {adult ? "✓" : ""}
            </span>
            {t("i'm 18 or older")}
          </button>
        </div>
      ),
    },
  ]

  if (already) {
    return (
      <div className="relative flex min-h-[var(--app-h)] flex-col justify-center px-6">
        <img src="/art/icon-chat.png" alt="" className="h-24 w-24 object-contain" draggable="false" />
        <h1 className="display mt-2 text-[32px] font-bold leading-[0.98] tracking-tight">{t("you're already a member")}</h1>
        <p className="mt-3 text-[15px] text-ink-soft">
          @{ig} {t("already has an account. we just emailed a link that opens it to the address you signed up with.")}
        </p>
        <button onClick={onBack} className="mt-6 w-fit text-[14px] font-semibold text-ink-soft underline underline-offset-4">
          {t("back")}
        </button>
      </div>
    )
  }

  const chip = cityChip(city, customCity)
  const cur = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="relative flex min-h-[var(--app-h)] flex-col px-5 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="relative flex items-center gap-3">
        <button onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))} aria-label={t("back")}>
          <ArrowLeft size={22} weight="bold" />
        </button>
        <div className="flex flex-1 gap-1.5">
          {steps.map((s, i) => (
            <span key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-line"}`} />
          ))}
        </div>
        <span className="font-mono text-[11px] text-ink-soft">{step > 0 ? `${chip.emoji} ${chip.name}` : `@${ig}`}</span>
      </div>

      {params.get("by") && step === 0 && (
        <div className="relative mt-4 flex items-center gap-2 rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3">
          <img src="/art/icon-people.png" alt="" className="h-9 w-9 shrink-0 object-contain" draggable="false" />
          <p className="text-[13.5px] font-bold leading-tight">
            @{params.get("by")} {t("invited you. their dates are already in.")}
          </p>
        </div>
      )}

      {/* no exit animation: a step that waits on one can leave a blank screen */}
      <div className="relative flex flex-1 flex-col justify-center py-6">
        <motion.div key={cur.key} variants={slide} initial="enter" animate="center" className="flex flex-col">
          {!cur.hideArt && <img src={cur.art} alt="" className="h-24 w-24 select-none object-contain" draggable="false" />}
          {cur.title && <h1 className="display mt-2 text-[32px] font-bold leading-[0.98] tracking-tight">{cur.title}</h1>}
          <div className={cur.hideArt ? "" : "mt-5"}>{cur.body}</div>
        </motion.div>
      </div>

      {err && <p className="relative pb-2 text-[14px] font-semibold text-[#8f2b2b]">{err}</p>}

      <motion.button
        whileTap={{ scale: 0.97 }}
        disabled={!cur.valid || busy}
        onClick={() => {
          if (last) return submit()
          if (steps[step].key === "vibes") loadPreview()
          setStep((s) => s + 1)
        }}
        className="relative flex items-center justify-center gap-2 rounded-full bg-ink py-4 text-[17px] font-bold text-cream disabled:opacity-40"
      >
        {busy ? <CircleNotch size={18} className="animate-spin" /> : null}
        {last ? t("let me in") : cur.key === "reveal" ? t("claim my spot") : t("next")}
        {!last && <ArrowRight size={18} weight="bold" />}
      </motion.button>

    </div>
  )
}
