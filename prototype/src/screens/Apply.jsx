import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft, ArrowRight, InstagramLogo, EnvelopeSimple,
  Camera, CheckCircle, DoorOpen,
} from "@phosphor-icons/react"
import { COUNTRIES, CITY } from "../data"
import { BigButton, LiveDot, LiveCounter } from "../components/bits"
import { t } from "../lib/i18n"

const slide = {
  enter: { opacity: 0, x: 36 },
  center: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 170, damping: 22 } },
  exit: { opacity: 0, x: -36, transition: { duration: 0.18 } },
}

// woman / man / non-binary — value is the snake-case stored on the member row
const GENDERS = [
  { value: "woman", label: "woman" },
  { value: "man", label: "man" },
  { value: "nonbinary", label: "non-binary" },
]

const INTERESTS = [
  "dinners with strangers", "coffee + cowork", "nightlife", "live music",
  "hiking + nature", "fitness + padel", "yoga + wellness", "art + museums",
  "photography", "food tours", "day trips", "beaches",
  "language exchange", "startups + tech", "books + films", "football",
]
const MAX_INTERESTS = 10

const TRIP_CITIES = [
  { slug: "medellin", name: "Medellín" },
  { slug: "cdmx", name: "Mexico City" },
  { slug: "miami", name: "Miami" },
  { slug: "lisboa", name: "Lisbon" },
  { slug: "bali", name: "Bali" },
]

const todayIso = () => new Date().toISOString().slice(0, 10)
const addDaysIso = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function Chip({ label, active, onClick, disabled }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.96 }}
      className={`rounded-full border px-4 py-2.5 text-left text-[14px] font-medium transition-colors duration-150 disabled:opacity-35 ${ active ? "border-transparent bg-ink text-cream text-ink" : "border-line bg-white/60 text-ink-soft" }`}
    >
      {label}
    </motion.button>
  )
}

// age in whole years from a YYYY-MM-DD string (null if empty/unparseable)
function ageFrom(iso) {
  if (!iso) return null
  const b = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a -= 1
  return a
}

// downscale + jpeg-compress a picked photo so it slides under the upload cap
function fileToDataUrl(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        canvas.getContext("2d").drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.82))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// eslint-disable-next-line no-unused-vars
export default function Apply({ onBack, onSubmit }) {
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState("")
  const [birthday, setBirthday] = useState("")
  const [name, setName] = useState("")
  const [gender, setGender] = useState("")
  const [country, setCountry] = useState("")
  const [ig, setIg] = useState("")
  const [photo, setPhoto] = useState(null)
  const [selfieState, setSelfieState] = useState("idle") // idle | checking | verified
  // v2: the dates people actually travel. posted as a trip the moment they join.
  const [tripCity, setTripCity] = useState("medellin")
  const [tripStart, setTripStart] = useState(todayIso())
  const [tripEnd, setTripEnd] = useState(addDaysIso(todayIso(), 6))
  const [flexible, setFlexible] = useState(false)
  const [interests, setInterests] = useState([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null) // { token, memberNo } -> celebratory state

  const age = ageFrom(birthday)
  const underage = age !== null && age < 18

  const runSelfieCheck = () => {
    if (selfieState !== "idle") return
    setSelfieState("checking")
    setTimeout(() => setSelfieState("verified"), 1700)
  }

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setPhoto(await fileToDataUrl(file))
    } catch {
      setError(t("that photo didn't load — try another"))
    }
  }

  const steps = [
    {
      // auth / start — email is the account anchor + where the pass lands
      key: "start",
      title: t("let's get you in"),
      sub: t("no password. your email is your key — and where your pass lands"),
      valid: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()),
      body: (
        <div className="flex items-center gap-2 border-b-2 border-line pb-2 focus-within:border-lime-deep">
          <EnvelopeSimple size={24} className="text-ink-soft" />
          <input
            autoFocus
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full bg-transparent text-[24px] font-medium outline-none placeholder:text-ink-soft/40"
          />
        </div>
      ),
    },
    {
      key: "birthday",
      title: t("when's your birthday?"),
      sub: t("you've got to be 18 to join. we check"),
      valid: age !== null && age >= 18,
      body: (
        <div>
          <input
            autoFocus
            type="date"
            value={birthday}
            max="2010-12-31"
            onChange={(e) => setBirthday(e.target.value)}
            className="w-full border-b-2 border-line bg-transparent pb-2 text-[24px] font-medium outline-none focus:border-lime-deep"
          />
          {underage && (
            <p className="mt-3 text-[13px] font-medium text-[#b3461f]">
              {t("you've got to be 18+ to join irlpass")}
            </p>
          )}
          {age !== null && age >= 18 && (
            <p className="mt-3 text-[13px] text-ink-soft">{t("nice — you're in the clear")}</p>
          )}
        </div>
      ),
    },
    {
      key: "name",
      title: t("what's your name?"),
      sub: t("this goes on your pass"),
      valid: name.trim().length > 1,
      body: (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("first name")}
          className="w-full border-b-2 border-line bg-transparent pb-2 text-[26px] font-medium outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
        />
      ),
    },
    {
      key: "gender",
      title: t("how do you identify?"),
      sub: t("this helps keep the club balanced and safe"),
      valid: !!gender,
      body: (
        <div className="flex flex-col gap-2.5">
          {GENDERS.map((g) => (
            <Chip key={g.value} label={t(g.label)} active={gender === g.value} onClick={() => setGender(g.value)} />
          ))}
        </div>
      ),
    },
    {
      key: "country",
      title: t("where are you from?"),
      sub: t("your flag goes on your pass"),
      valid: country.trim().length > 1,
      body: (
        <div>
          <input
            autoFocus
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder={t("start typing… (colombia, usa, france)")}
            className="w-full border-b-2 border-line bg-transparent pb-2 text-[22px] font-medium outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
          />
          <div className="mt-4 flex max-h-56 flex-wrap content-start gap-2 overflow-y-auto">
            {COUNTRIES.filter((c) => c.name.toLowerCase().includes(country.trim().toLowerCase()))
              .slice(0, country.trim() ? 30 : 12)
              .map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCountry(c.name)}
                  className={`rounded-full border px-3.5 py-2 text-[13.5px] transition-colors ${ country === c.name ? "border-transparent bg-ink text-cream font-semibold text-ink" : "border-line bg-white/60 text-ink-soft" }`}
                >
                  {c.flag} {c.name}
                </button>
              ))}
          </div>
        </div>
      ),
    },
    {
      key: "ig",
      title: t("what's your instagram?"),
      sub: t("a real human checks this. not a bot, a human"),
      valid: ig.trim().length > 2,
      body: (
        <div className="flex items-center gap-2 border-b-2 border-line pb-2 focus-within:border-lime-deep">
          <InstagramLogo size={24} className="text-ink-soft" />
          <input
            autoFocus
            value={ig}
            onChange={(e) => setIg(e.target.value.replace(/\s/g, ""))}
            placeholder="@handle"
            className="w-full bg-transparent text-[26px] font-medium outline-none placeholder:text-ink-soft/40"
          />
        </div>
      ),
    },
    {
      key: "photo",
      title: t("add a photo"),
      sub: t("your face on the pass — so people know who's landing"),
      valid: !!photo,
      body: (
        <div className="flex flex-col items-center pt-2">
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
            <div className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-full border border-line bg-white/60">
              {photo ? (
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-ink-soft">
                  <Camera size={34} weight="duotone" />
                  <span className="text-[12.5px] font-medium">{t("tap to add")}</span>
                </div>
              )}
            </div>
          </label>
          {photo && (
            <label className="mt-4 cursor-pointer text-[13px] font-medium text-ink-soft underline">
              <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
              {t("change photo")}
            </label>
          )}
        </div>
      ),
    },
    {
      key: "selfie",
      title: t("now a quick selfie"),
      sub: t("strike a pose ✌️ — proves you're a real human"),
      valid: selfieState === "verified",
      body: (
        <div className="flex flex-col items-center pt-2">
          <motion.div
            className={`flex h-44 w-44 items-center justify-center rounded-full border ${ selfieState === "verified" ? "border-lime-deep bg-lime/30" : "border-line bg-white/60" }`}
            animate={selfieState === "checking" ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={{ duration: 1, repeat: selfieState === "checking" ? Infinity : 0 }}
          >
            {selfieState === "verified" ? (
              <CheckCircle size={64} weight="fill" className="text-lime-deep" />
            ) : (
              <Camera size={40} weight="duotone" className="text-ink-soft" />
            )}
          </motion.div>
          <button
            onClick={runSelfieCheck}
            disabled={selfieState !== "idle"}
            className="mt-6 rounded-full bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-6 py-3 text-[14px] font-semibold text-ink disabled:opacity-50"
          >
            {selfieState === "idle" && t("strike a pose ✌️")}
            {selfieState === "checking" && t("checking…")}
            {selfieState === "verified" && t("verified ✓ you're real")}
          </button>
        </div>
      ),
    },
    {
      key: "dates",
      title: t("when are you there?"),
      sub: t("this is what puts you on the calendar — you'll see who overlaps"),
      valid: !!tripStart && !!tripEnd && tripEnd >= tripStart,
      body: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {TRIP_CITIES.map((c) => (
              <Chip key={c.slug} label={c.name} active={tripCity === c.slug} onClick={() => setTripCity(c.slug)} />
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="apply-start" className="text-[12px] text-ink-soft font-semibold">arrive</label>
              <input
                id="apply-start" type="date" value={tripStart} min={todayIso()}
                onChange={(e) => { setTripStart(e.target.value); if (tripEnd < e.target.value) setTripEnd(e.target.value) }}
                className="mt-1.5 w-full rounded-2xl border border-line bg-white/70 px-3 py-3 text-[15px]"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="apply-end" className="text-[12px] text-ink-soft font-semibold">leave</label>
              <input
                id="apply-end" type="date" value={tripEnd} min={tripStart}
                onChange={(e) => setTripEnd(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-line bg-white/70 px-3 py-3 text-[15px]"
              />
            </div>
          </div>
          <Chip label={t("i'm flexible on these dates")} active={flexible} onClick={() => setFlexible((f) => !f)} />
        </div>
      ),
    },
    {
      key: "interests",
      title: t("what are you into?"),
      sub: t("pick up to 10 — we'll match you to the right people"),
      valid: interests.length > 0,
      body: (
        <div className="flex flex-wrap gap-2.5">
          {INTERESTS.map((r) => {
            const active = interests.includes(r)
            return (
              <Chip
                key={r}
                label={t(r)}
                active={active}
                disabled={!active && interests.length >= MAX_INTERESTS}
                onClick={() =>
                  setInterests((prev) =>
                    prev.includes(r) ? prev.filter((x) => x !== r) : prev.length >= MAX_INTERESTS ? prev : [...prev, r]
                  )
                }
              />
            )
          })}
        </div>
      ),
    },
  ]

  const current = steps[step]
  const last = step === steps.length - 1

  const next = async () => {
    if (!last) {
      setStep((s) => s + 1)
      return
    }
    // final step -> AUTO-ACCEPT: create the member + mint the token
    const applicant = {
      name,
      country: country.trim(),
      ig: ig.startsWith("@") ? ig : `@${ig}`,
      email: email.trim(),
      gender,
      birthday,
      dates: flexible ? `${tripStart} to ${tripEnd} (flexible)` : `${tripStart} to ${tripEnd}`,
      reasons: interests, // legacy field still carries their interests
      interests,
      verifiedSelfie: selfieState === "verified",
      allowDmFromMen: true,
      showIgToMen: true,
      city: tripCity,
    }
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch("/api/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(applicant),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.token) throw new Error(data.error || "bad response")

      // upload the photo against the freshly-minted member token
      if (photo) {
        try {
          await fetch("/api/profile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ t: data.token, image: photo }),
          })
        } catch {}
      }

      // put them on the calendar immediately — this is the whole point of v2
      try {
        await fetch("/api/trips", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ t: data.token, city: tripCity, starts: tripStart, ends: tripEnd, flexible }),
        })
      } catch {}

      localStorage.setItem("irlpass_member_token", data.token)
      onSubmit?.(applicant)
      setDone({ token: data.token, memberNo: data.memberNo })
    } catch (err) {
      setError(
        /18/.test(String(err.message))
          ? t("you've got to be 18+ to join irlpass")
          : t("couldn't send — check your connection and try again")
      )
      setSubmitting(false)
    }
  }

  // ── celebratory "you're in 🎉" — auto-accepted, routes into the app ──
  if (done) {
    const memberNo = done.memberNo
    return (
      <div className="relative flex min-h-[var(--app-h)] flex-col items-center justify-center overflow-hidden bg-ink px-6 text-center text-cream">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-[12px] font-medium text-cream/50"
        >
          {t("auto-accepted")}
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.18 }}
          className="display mt-2 text-[54px] font-bold leading-none"
        >
          {t("you're")} <em className="italic text-lime">{t("in")}</em> 🎉
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mt-4 text-[15px] text-cream/70"
        >
          {t("welcome to medellín, {name}").replace("{name}", name.toLowerCase())}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="mt-1.5 text-[12px] text-lime font-semibold"
        >
          {t("member")} nº {memberNo}
        </motion.p>
        <motion.a
          href={`/?screen=app&t=${done.token}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          whileTap={{ scale: 0.97 }}
          className="mt-10 flex w-full max-w-[320px] items-center justify-center gap-2 rounded-full bg-lime px-6 py-4 text-[15px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)]"
        >
          <DoorOpen size={19} weight="fill" /> {t("enter the club")}
        </motion.a>
      </div>
    )
  }

  return (
    <div className="flex min-h-[var(--app-h)] flex-col px-5">
      <header className="flex items-center justify-between pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-12">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/60"
          aria-label="back"
        >
          <ArrowLeft size={18} weight="bold" />
        </motion.button>
        {/* progress */}
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <motion.span
              key={s.key}
              layout
              className={`h-1.5 rounded-full ${i <= step ? "bg-lime-deep" : "bg-line"}`}
              animate={{ width: i === step ? 22 : 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
            />
          ))}
        </div>
        <span className="w-10 text-right tabular-nums text-[11px] text-ink-soft">
          {step + 1}/{steps.length}
        </span>
      </header>

      {/* live "travelers active now" counter — NomadTable energy */}
      <div className="mt-3 flex items-center justify-center gap-2 tabular-nums text-[11px] font-medium text-ink-soft">
        <LiveDot />
        <LiveCounter start={CITY.travelersNow} /> {t("travelers active now")}
      </div>

      <AnimatePresence mode="wait">
        <motion.main key={current.key} variants={slide} initial="enter" animate="center" exit="exit" className="flex-1 pt-9">
          <h2 className="display text-[32px] leading-tight">{current.title}</h2>
          <p className="mt-1.5 text-[14px] text-ink-soft">{current.sub}</p>
          <div className="pt-9">{current.body}</div>
        </motion.main>
      </AnimatePresence>

      <footer className="pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-4">
        {error && (
          <p className="mb-2.5 text-center text-[12.5px] font-medium text-[#b3461f]">{error}</p>
        )}
        <BigButton onClick={next} disabled={!current.valid || submitting}>
          <span className="flex items-center justify-center gap-2">
            {submitting ? t("letting you in…") : last ? t("join the club") : t("next")}
            {!submitting && <ArrowRight size={18} weight="bold" />}
          </span>
        </BigButton>
      </footer>
    </div>
  )
}
