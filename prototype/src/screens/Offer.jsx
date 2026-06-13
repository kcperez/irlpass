import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle, LockSimple, CircleNotch } from "@phosphor-icons/react"
import { Logo } from "../components/bits"
import { t } from "../lib/i18n"

const PERKS = [
  "the medellín club. everyone in it got vetted like you did",
  "create and join activities: dinners, day trips, padel, whatever",
  "a private chat for every plan, plus the city lobby",
  "a seat at the thursday table before anyone else",
  "your nº is permanent. city 30 will know you were at city one",
]

export default function Offer({ token }) {
  const [member, setMember] = useState(null)
  const [plan, setPlan] = useState("monthly")
  const [state, setState] = useState("loading") // loading | ready | invalid | paying | payError

  useEffect(() => {
    if (!token) return setState("invalid")
    fetch(`/api/offer?t=${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m) => {
        setMember(m)
        setState("ready")
      })
      .catch(() => setState("invalid"))
  }, [token])

  const checkout = async () => {
    setState("paying")
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, plan }),
      })
      const d = await r.json()
      if (!d.url) throw new Error()
      window.location.href = d.url
    } catch {
      setState("payError")
    }
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-[var(--app-h)] flex-col items-center justify-center bg-ink text-cream">
        <CircleNotch size={28} className="animate-spin text-lime" />
      </div>
    )
  }

  if (state === "invalid") {
    return (
      <div className="flex min-h-[var(--app-h)] flex-col items-start justify-center bg-ink px-7 text-cream">
        <Logo size="text-[20px]" />
        <h2 className="display mt-5 text-[34px] font-bold leading-tight">{t("this link isn't active.")}</h2>
        <p className="mt-3 max-w-[30ch] text-[14.5px] leading-relaxed text-cream/60">
          founding offers are private and tied to accepted applications. if you think this is a
          mistake, reply to the message that brought you here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[var(--app-h)] flex-col bg-ink px-6 text-cream">
      <header className="flex items-center justify-between pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-12">
        <Logo size="text-[19px]" />
        <span className="rounded-full border border-cream/15 px-3 py-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-cream/55">
          private offer
        </span>
      </header>

      <main className="flex-1 pt-9">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-lime"
        >
          {t("application approved")}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.1 }}
          className="display mt-1.5 text-[42px] font-bold leading-[1.02]"
        >
          congrats, {member.name.toLowerCase().split(" ")[0]}.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mt-3 text-[15px] leading-relaxed text-cream/70"
        >
          founding member nº {member.memberNo} of 050 has your name on it. the club app is live:
          the activity board, the medellín lobby, a private chat for every plan, the thursday
          tables. most people will find out about this from a video. you get to say you were here first.
        </motion.p>

        <motion.ul
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-7 space-y-3"
        >
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[14px] leading-snug text-cream/85">
              <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-lime" />
              {p}
            </li>
          ))}
        </motion.ul>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48 }}
          className="mt-8 grid grid-cols-2 gap-2.5"
        >
          <button
            onClick={() => setPlan("monthly")}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              plan === "monthly" ? "border-lime bg-cream/[0.06]" : "border-cream/12 bg-cream/[0.03]"
            }`}
          >
            <p className="display text-[26px] font-bold leading-none">$9.99</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-cream/55">{t("per month")}</p>
            <p className="mt-2 font-mono text-[9.5px] text-cream/45">{t("cancel anytime")}</p>
          </button>
          <button
            onClick={() => setPlan("yearly")}
            className={`relative rounded-2xl border p-4 text-left transition-colors ${
              plan === "yearly" ? "border-lime bg-cream/[0.06]" : "border-cream/12 bg-cream/[0.03]"
            }`}
          >
            <span className="absolute -top-2 right-3 rounded-full bg-lime px-2 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-ink">
              {t("save 42%")}
            </span>
            <p className="display text-[26px] font-bold leading-none">$69.99</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-cream/55">{t("per year")}</p>
            <p className="mt-2 font-mono text-[9.5px] text-cream/45">≈ $5.83/mo</p>
          </button>
        </motion.div>
      </main>

      <footer className="pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
        {state === "payError" && (
          <p className="mb-2.5 text-center text-[12.5px] font-medium text-[#e58a63]">
            checkout didn't open. try again
          </p>
        )}
        <motion.button
          onClick={checkout}
          disabled={state === "paying"}
          whileTap={{ scale: 0.97 }}
          className="w-full rounded-full bg-lime px-6 py-4 text-[15.5px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)] disabled:opacity-60"
        >
          {state === "paying" ? t("opening checkout…") : t("claim spot nº {n} · {price}", { n: member.memberNo, price: plan === "yearly" ? "$69.99/yr" : "$9.99/mo" })}
        </motion.button>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cream/40">
          <LockSimple size={11} weight="bold" /> {t("secure checkout by stripe")}
        </p>
      </footer>
    </div>
  )
}
