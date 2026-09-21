import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, CircleNotch, LockSimple } from "@phosphor-icons/react"
import { useEffect } from "react"
import { t } from "../lib/i18n"
import { CITY_INDEX, searchCities, slugify, cityChip } from "../lib/cities"

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
  const [step, setStep] = useState(invited ? 2 : 0)
  const [city, setCity] = useState(params.get("city") || "medellin")
  const [customCity, setCustomCity] = useState("")
  const [flexible, setFlexible] = useState(false)
  const [picked, setPicked] = useState(params.get("starts") ? "shared" : null) // which preset, or "exact"
  const [exact, setExact] = useState(false)
  const matches = (() => {
    const found = searchCities(customCity)
    const slug = slugify(customCity)
    // anything we don't know still gets a chip, with a pin
    if (slug && !found.some((c) => c.slug === slug)) return [cityChip(slug, customCity), ...found].slice(0, 6)
    return found
  })()
  const [starts, setStarts] = useState(params.get("starts") || todayIso())
  const [ends, setEnds] = useState(params.get("ends") || addDays(todayIso(), 6))
  const [email, setEmail] = useState("")
  const [adult, setAdult] = useState(false)
  const [preview, setPreview] = useState(null)
  const [byCity, setByCity] = useState({})

  // live head count per city, so a chip can show what's actually happening
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then((d) => setByCity(d.byCity || {})).catch(() => {})
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
          name: ig,
          ig: `@${ig}`,
          email: email.trim(),
          adult,
          city,
          dates: `${starts} to ${ends}`,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.token) throw new Error(d.error || "something went wrong")
      await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: d.token, city, starts, ends }),
      }).catch(() => {})
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
        body: JSON.stringify({ city, starts, ends }),
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
            onChange={(e) => {
              setCustomCity(e.target.value)
              const slug = slugify(e.target.value)
              if (slug) setCity(slug)
            }}
            autoComplete="off"
            placeholder={t("type any city")}
            className="w-full rounded-[1.4rem] border-2 border-line bg-white/70 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
          />

          <div className="flex flex-wrap gap-2">
            {(customCity.trim() ? matches : QUICK).map((c) => (
              <Bubble
                key={c.slug}
                active={city === c.slug}
                onClick={() => { setCity(c.slug); setCustomCity(c.name) }}
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
        </div>
      ),
    },
    {
      key: "when",
      art: "/art/icon-dates.png",
      title: t("when?"),
      valid: !!picked && !!starts && !!ends && ends >= starts,
      body: (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "now", label: t("i'm here now"), s: todayIso(), e: addDays(todayIso(), 13), flex: false },
              { key: "week", label: t("next week"), s: addDays(todayIso(), 7), e: addDays(todayIso(), 13), flex: false },
              { key: "month", label: t("next month"), s: addDays(todayIso(), 30), e: addDays(todayIso(), 36), flex: false },
              { key: "soon", label: t("not sure yet"), s: todayIso(), e: addDays(todayIso(), 29), flex: true },
            ].map((q) => (
              <Bubble
                key={q.key}
                active={picked === q.key}
                onClick={() => { setPicked(q.key); setStarts(q.s); setEnds(q.e); setFlexible(q.flex); setExact(false) }}
              >
                {q.label}
              </Bubble>
            ))}
          </div>

          {exact ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="join-start" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("from")}</label>
                <input
                  id="join-start" type="date" value={starts} min={todayIso()}
                  onChange={(e) => { setStarts(e.target.value); setPicked("exact"); if (ends < e.target.value) setEnds(e.target.value) }}
                  className="mt-1.5 w-full rounded-[1.2rem] border-2 border-line bg-white/70 px-3 py-3 text-[16px] font-semibold"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="join-end" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("until")}</label>
                <input
                  id="join-end" type="date" value={ends} min={starts}
                  onChange={(e) => { setEnds(e.target.value); setPicked("exact") }}
                  className="mt-1.5 w-full rounded-[1.2rem] border-2 border-line bg-white/70 px-3 py-3 text-[16px] font-semibold"
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setExact(true); setPicked("exact") }}
              className="w-fit text-[13px] font-semibold text-ink-soft underline underline-offset-4"
            >
              {t("pick exact dates")}
            </button>
          )}

          {picked && (
            <p className="text-[13px] font-semibold text-ink-soft">
              {flexible
                ? t("we'll look at the next month and ping you when someone matches")
                : `${fmtShort(starts)} → ${fmtShort(ends)}`}
            </p>
          )}
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
                      {preview.sameDay > 0 && ` · ${preview.sameDay} ${t("land the same day as you")}`}
                    </>
                  ) : (
                    <>
                      {t("they're already there. nobody's posted your exact days yet, so you'd be first.")}
                    </>
                  )}
                </p>
              </div>

              {(preview.count > 0 ? preview.faces : preview.cityFaces || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(preview.count > 0 ? preview.faces : preview.cityFaces).map((f, i) => (
                    <motion.div
                      key={`${f.first}-${i}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.25 + i * 0.07, type: "spring", stiffness: 220, damping: 18 }}
                      className="relative"
                    >
                      {f.photo ? (
                        <img src={f.photo} alt="" className={`h-14 w-14 rounded-full object-cover ${i > 0 ? "blur-[5px]" : ""}`} />
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
      title: t("where do we send your pass?"),
      valid: EMAIL_RE.test(email.trim()) && adult,
      body: (
        <div className="flex flex-col gap-2.5">
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

      <AnimatePresence mode="wait">
        <motion.div key={cur.key} variants={slide} initial="enter" animate="center" exit="exit" className="relative flex flex-1 flex-col justify-center py-6">
          {!cur.hideArt && <img src={cur.art} alt="" className="h-24 w-24 select-none object-contain" draggable="false" />}
          {cur.title && <h1 className="display mt-2 text-[32px] font-bold leading-[0.98] tracking-tight">{cur.title}</h1>}
          <div className={cur.hideArt ? "" : "mt-5"}>{cur.body}</div>
        </motion.div>
      </AnimatePresence>

      {err && <p className="relative pb-2 text-[14px] font-semibold text-[#8f2b2b]">{err}</p>}

      <motion.button
        whileTap={{ scale: 0.97 }}
        disabled={!cur.valid || busy}
        onClick={() => {
          if (last) return submit()
          if (steps[step].key === "when") loadPreview()
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
