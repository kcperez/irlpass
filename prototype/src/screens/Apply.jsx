import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ArrowRight, InstagramLogo, EnvelopeSimple } from "@phosphor-icons/react"
import { DATE_OPTIONS, REASON_OPTIONS, COUNTRIES } from "../data"
import { BigButton } from "../components/bits"

const slide = {
  enter: { opacity: 0, x: 36 },
  center: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 170, damping: 22 } },
  exit: { opacity: 0, x: -36, transition: { duration: 0.18 } },
}

function Chip({ label, active, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`rounded-full border px-4 py-2.5 text-left text-[14px] font-medium transition-colors duration-150 ${
        active ? "border-ink bg-lime text-ink" : "border-line bg-white/60 text-ink-soft"
      }`}
    >
      {label}
    </motion.button>
  )
}

export default function Apply({ onBack, onSubmit }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [country, setCountry] = useState("")
  const [ig, setIg] = useState("")
  const [email, setEmail] = useState("")
  const [dates, setDates] = useState(null)
  const [reasons, setReasons] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const steps = [
    {
      key: "name",
      title: "what's your name?",
      sub: "this goes on your pass",
      valid: name.trim().length > 1,
      body: (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="first name"
          className="w-full border-b-2 border-line bg-transparent pb-2 text-[26px] font-medium outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
        />
      ),
    },
    {
      key: "country",
      title: "where are you from?",
      sub: "your flag goes on your pass",
      valid: country.trim().length > 1,
      body: (
        <div>
          <input
            autoFocus
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="start typing… (colombia, usa, france)"
            className="w-full border-b-2 border-line bg-transparent pb-2 text-[22px] font-medium outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
          />
          <div className="mt-4 flex max-h-56 flex-wrap content-start gap-2 overflow-y-auto">
            {COUNTRIES.filter((c) => c.name.toLowerCase().includes(country.trim().toLowerCase()))
              .slice(0, country.trim() ? 30 : 12)
              .map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCountry(c.name)}
                  className={`rounded-full border px-3.5 py-2 text-[13.5px] transition-colors ${
                    country === c.name ? "border-ink bg-lime font-semibold text-ink" : "border-line bg-white/60 text-ink-soft"
                  }`}
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
      title: "what's your instagram?",
      sub: "a real human checks this. not a bot, a human",
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
      key: "email",
      title: "last thing. where can we reach you?",
      sub: "your decision lands in your inbox, usually within 24 hours",
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
      key: "dates",
      title: "when are you in medellín?",
      sub: "flexible counts — you'll still see who overlaps",
      valid: !!dates,
      body: (
        <div className="flex flex-col gap-2.5">
          {DATE_OPTIONS.map((d) => (
            <Chip key={d} label={d} active={dates === d} onClick={() => setDates(d)} />
          ))}
        </div>
      ),
    },
    {
      key: "reasons",
      title: "what are you here for?",
      sub: "pick anything that's true",
      valid: reasons.length > 0,
      body: (
        <div className="flex flex-wrap gap-2.5">
          {REASON_OPTIONS.map((r) => (
            <Chip
              key={r}
              label={r}
              active={reasons.includes(r)}
              onClick={() =>
                setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
              }
            />
          ))}
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
    const applicant = {
      name,
      country: country.trim(),
      ig: ig.startsWith("@") ? ig : `@${ig}`,
      email: email.trim(),
      dates,
      reasons,
      city: "medellin",
    }
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch("/api/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(applicant),
      })
      if (!r.ok) throw new Error("bad response")
      onSubmit(applicant)
    } catch {
      setError("couldn't send — check your connection and try again")
      setSubmitting(false)
    }
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
        <span className="w-10 text-right font-mono text-[11px] text-ink-soft">
          {step + 1}/{steps.length}
        </span>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={current.key} variants={slide} initial="enter" animate="center" exit="exit" className="flex-1 pt-12">
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
            {submitting ? "sending…" : last ? "submit application" : "next"}
            {!submitting && <ArrowRight size={18} weight="bold" />}
          </span>
        </BigButton>
      </footer>
    </div>
  )
}
