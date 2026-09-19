import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, CircleNotch, LockSimple } from "@phosphor-icons/react"
import { useEffect } from "react"
import { t } from "../lib/i18n"

// two taps and you're on the calendar: where + when, then how we reach you.

const CITIES = [
  { slug: "medellin", name: "Medellín", emoji: "🇨🇴", live: true },
  { slug: "cdmx", name: "Mexico City", emoji: "🇲🇽" },
  { slug: "miami", name: "Miami", emoji: "🌴" },
  { slug: "lisboa", name: "Lisbon", emoji: "🇵🇹" },
  { slug: "bali", name: "Bali", emoji: "🌺" },
]
const slugify = (name) =>
  String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)

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

export default function Join({ ig, onBack, onDone }) {
  const [step, setStep] = useState(0)
  const [city, setCity] = useState("medellin")
  const [cityName, setCityName] = useState("Medellín")
  const [customCity, setCustomCity] = useState("")
  const [flexible, setFlexible] = useState(false)
  const [here, setHere] = useState(null) // null until they say now or later
  const [starts, setStarts] = useState(todayIso())
  const [ends, setEnds] = useState(addDays(todayIso(), 6))
  const [email, setEmail] = useState("")
  const [birthday, setBirthday] = useState("")
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
          birthday,
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
              if (slug) { setCity(slug); setCityName(e.target.value.trim()) }
            }}
            placeholder={t("type any city")}
            className="w-full rounded-[1.4rem] border-2 border-line bg-white/70 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
          />
          <div className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <Bubble
                key={c.slug}
                active={city === c.slug}
                onClick={() => { setCity(c.slug); setCityName(c.name); setCustomCity("") }}
              >
                <span className="mr-1.5">{c.emoji}</span>
                {c.name}
                {byCity[c.slug] > 0 ? (
                  <span className="ml-2 inline-flex items-center gap-1 align-middle">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-deep opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-deep" />
                    </span>
                    <span className="text-[12px] font-bold">{byCity[c.slug]}</span>
                  </span>
                ) : null}
              </Bubble>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "when",
      art: "/art/icon-dates.png",
      title: here === null ? t("are you there now?") : here ? t("until when?") : t("when are you going?"),
      valid: here !== null && !!starts && !!ends && ends >= starts,
      body: (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Bubble
              active={here === true}
              onClick={() => { setHere(true); setStarts(todayIso()); setEnds(addDays(todayIso(), 13)) }}
              className="flex-1"
            >
              {t("i'm here now")}
            </Bubble>
            <Bubble
              active={here === false}
              onClick={() => { setHere(false); setStarts(addDays(todayIso(), 7)); setEnds(addDays(todayIso(), 13)) }}
              className="flex-1"
            >
              {t("i'm going soon")}
            </Bubble>
          </div>

          {here === true && (
            <div className="flex flex-wrap gap-2">
              {[
                { label: t("another week"), e: addDays(todayIso(), 6), flex: false },
                { label: t("another month"), e: addDays(todayIso(), 29), flex: false },
                { label: t("i live here"), e: addDays(todayIso(), 89), flex: true },
              ].map((q) => (
                <Bubble
                  key={q.label}
                  active={ends === q.e}
                  onClick={() => { setStarts(todayIso()); setEnds(q.e); setFlexible(q.flex) }}
                  className="flex-1"
                >
                  {q.label}
                </Bubble>
              ))}
            </div>
          )}

          {here === false && (
            <>
              <div className="flex gap-2">
                {[
                  { label: t("next week"), s: addDays(todayIso(), 7), e: addDays(todayIso(), 13) },
                  { label: t("next month"), s: addDays(todayIso(), 30), e: addDays(todayIso(), 36) },
                ].map((q) => (
                  <Bubble
                    key={q.label}
                    active={starts === q.s && ends === q.e}
                    onClick={() => { setStarts(q.s); setEnds(q.e) }}
                    className="flex-1"
                  >
                    {q.label}
                  </Bubble>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="join-start" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("from")}</label>
                  <input
                    id="join-start" type="date" value={starts} min={todayIso()}
                    onChange={(e) => { setStarts(e.target.value); if (ends < e.target.value) setEnds(e.target.value) }}
                    className="mt-1.5 w-full rounded-[1.2rem] border-2 border-line bg-white/70 px-3 py-3 text-[16px] font-semibold"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="join-end" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("until")}</label>
                  <input
                    id="join-end" type="date" value={ends} min={starts}
                    onChange={(e) => setEnds(e.target.value)}
                    className="mt-1.5 w-full rounded-[1.2rem] border-2 border-line bg-white/70 px-3 py-3 text-[16px] font-semibold"
                  />
                </div>
              </div>
              <Bubble active={flexible} onClick={() => setFlexible((f) => !f)}>
                {t("dates aren't locked in yet")}
              </Bubble>
            </>
          )}

          {here !== null && (
            <p className="text-[12.5px] text-ink-soft">
              {fmtShort(starts)} → {fmtShort(ends)}{flexible ? ` · ${t("flexible")}` : ""}
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
              <div>
                <p className="display text-[72px] font-bold leading-[0.85] tracking-tight">
                  <CountUp to={preview.live ? preview.count : preview.asked} />
                </p>
                <p className="display mt-1 text-[26px] font-bold leading-tight">
                  {!preview.live
                    ? t("people headed there")
                    : preview.count === 1
                      ? t("person is there on your dates")
                      : t("people are there on your dates")}
                </p>
                {preview.count > 0 && (
                  <p className="mt-1.5 text-[14px] text-ink-soft">
                    {preview.women > 0 && `${preview.women} ${preview.women === 1 ? t("woman") : t("women")} · `}
                    {preview.men > 0 && `${preview.men} ${preview.men === 1 ? t("man") : t("men")}`}
                    {preview.sameDay > 0 && ` · ${preview.sameDay} ${t("land the same day as you")}`}
                  </p>
                )}
              </div>

              {!preview.live ? (
                <div className="rounded-[1.5rem] border-2 border-ink bg-lime px-4 py-4">
                  <p className="display text-[19px] font-bold leading-tight">
                    {preview.cityName} {t("is filling up")}
                  </p>
                  <p className="mt-1 text-[13.5px]">
                    {t("you're early. we'll ping you the moment someone's trip overlaps yours.")}
                  </p>
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/60">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.round(((preview.asked + 1) / preview.openAt) * 100))}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-full bg-ink"
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
                    {preview.asked + 1} / {preview.openAt} {t("before it goes live")}
                  </p>
                </div>
              ) : preview.count > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {preview.faces.map((f, i) => (
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
              ) : (
                <div className="rounded-[1.5rem] border-2 border-line bg-white/70 p-4">
                  <p className="text-[15px] font-semibold">{t("you'd be the first on those days")}</p>
                  <p className="mt-1 text-[13.5px] text-ink-soft">
                    {preview.inCity} {t("members are based there. post your dates and they get told you're coming.")}
                  </p>
                </div>
              )}

              {preview.foundingLeft > 0 && (
                <div className="flex items-center gap-2 rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3">
                  <span className="display text-[22px] font-bold">{preview.foundingLeft}</span>
                  <span className="text-[13px] font-semibold leading-tight">{t("founding spots left · message everyone free, forever")}</span>
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: "you",
      art: "/art/icon-chat.png",
      title: t("where do we send your pass?"),
      valid: EMAIL_RE.test(email.trim()) && !!birthday,
      body: (
        <div className="flex flex-col gap-2.5">
          <input
            id="join-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none" autoCorrect="off" spellCheck="false"
            placeholder={t("your email")}
            className="w-full rounded-[1.4rem] border-2 border-line bg-white/70 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
          />
          <div>
            <label htmlFor="join-bday" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("birthday · 18+ only")}</label>
            <input
              id="join-bday" type="date" value={birthday} max={addDays(todayIso(), -6570)}
              onChange={(e) => setBirthday(e.target.value)}
              className="mt-1.5 w-full rounded-[1.2rem] border-2 border-line bg-white/70 px-3 py-3 text-[16px] font-semibold"
            />
          </div>
        </div>
      ),
    },
  ]

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
        <span className="font-mono text-[11px] text-ink-soft">@{ig}</span>
      </div>

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
      {last && (
        <p className="relative pt-2 text-center text-[12px] text-ink-soft">{t("free · first 40 message everyone free")}</p>
      )}
    </div>
  )
}
