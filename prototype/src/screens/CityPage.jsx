import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, GlobeHemisphereWest, Ticket, ArrowRight, CalendarPlus } from "@phosphor-icons/react"
import { CITIES, TRAVELERS_NOW } from "../data"
import { Logo, Squiggle, LiveDot, LiveCounter, AvatarStack, Marquee, BigButton } from "../components/bits"
import { signInWithGoogle } from "../lib/auth"
import { t } from "../lib/i18n"


const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}
const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 130, damping: 20 } },
}

const FOUNDERS = [
  {
    img: "/kevin.jpg",
    name: "kevin",
    ig: "kevcas",
    title: "co-founder · member 001",
    note:
      "you can spend a month somewhere and never meet anyone. so we built the thing we always wanted: put your dates up, see who else is there, go do something. the first 40 people get it free for good.",
  },
  {
    img: "/josh.jpg",
    name: "josh mac",
    ig: "jawshmac",
    title: "co-founder · member 002",
    note:
      "half my dms are people asking when to come, who to meet, how to not be alone out there. now i can just say: post your dates and look at the calendar.",
  },
]

function FounderNotes() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % FOUNDERS.length), 5000)
    return () => clearInterval(t)
  }, [])
  const f = FOUNDERS[idx]
  return (
    <div className="relative min-h-[148px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={f.name}
          initial={{ opacity: 0, x: 22 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -22 }}
          transition={{ type: "spring", stiffness: 180, damping: 24 }}
          className="rounded-2xl border border-line bg-white/70 p-4"
        >
          <div className="flex items-center gap-2.5">
            <a href={`https://instagram.com/${f.ig}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2.5">
              <img src={f.img} alt={`${f.name}, co-founder`} className="h-9 w-9 rounded-full object-cover object-top" />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold leading-tight">
                  {f.name} <span className="tabular-nums text-[10.5px] font-medium text-ink-soft">@{f.ig}</span>
                </p>
                <p className="text-[12px] text-ink-soft font-semibold">{f.title}</p>
              </div>
            </a>
            <span className="ml-auto rounded-full bg-lime px-2.5 py-1 text-[12px] font-semibold text-ink">
              day one
            </span>
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink">{f.note}</p>
        </motion.div>
      </AnimatePresence>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {FOUNDERS.map((x, i) => (
          <span key={x.name} className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-5 bg-lime-deep" : "w-1.5 bg-line"}`} />
        ))}
      </div>
    </div>
  )
}

export default function CityPage({ onApply }) {
  const memberToken = localStorage.getItem("irlpass_member_token")
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex min-h-[var(--app-h)] flex-col">
      {/* top bar */}
      <motion.header variants={rise} className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-12">
        <Logo size="text-[21px]" />
        {memberToken ? (
          <a
            href={`/?screen=app&t=${memberToken}`}
            className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-lime"
          >
            {t("open the club →")}
          </a>
        ) : (
          <button
            onClick={() => signInWithGoogle()}
            className="rounded-full border border-line bg-cream-deep/70 px-3.5 py-1.5 text-[12px] font-semibold text-ink-soft active:scale-95"
          >
            {t("member sign in")}
          </button>
        )}
      </motion.header>

      {/* brand-led hero — global value prop, then social proof */}
      <motion.section variants={rise} className="px-5 pt-6">
        <p className="text-[12px] font-medium text-ink-soft">
          {t("post your dates. see who's there.")}
        </p>
        <h1 className="display mt-2 max-w-[9ch] text-[52px] font-bold leading-[0.95]">
          {t("nobody lands alone")}
          <Squiggle className="mt-1 w-[200px]" />
        </h1>
        <p className="mt-4 max-w-[22rem] text-[15.5px] leading-relaxed text-ink-soft">
          {t("say when you're in a city. see everyone whose trip overlaps yours, and message them.")}
        </p>

        {/* live global counter — the filmable launch asset */}
        <div className="mt-5 flex items-center gap-2.5 text-[15px]">
          <LiveDot />
          <span className="text-[17px]">
            <LiveCounter start={TRAVELERS_NOW} />
          </span>
          <span className="text-ink-soft">{t("travelers moving right now")}</span>
        </div>
        <div className="mt-3 flex items-center">
          <AvatarStack extra={t("{n} more across the map", { n: 128 })} />
        </div>

        {/* city one is live, the rest are dropping next — "wherever you land" */}
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          {CITIES.map((c) =>
            c.status === "live" ? (
              <span
                key={c.name}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 text-[12px] font-semibold text-ink"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-ink" /> {c.name} · {t("live")}
              </span>
            ) : (
              <span
                key={c.name}
                className="shrink-0 rounded-full border border-line bg-cream-deep/50 px-3 py-1.5 text-[12px] text-ink-soft/60 font-semibold"
              >
                {c.name} · {t("soon")}
              </span>
            )
          )}
        </div>
      </motion.section>

      {/* what the calendar actually looks like, city-agnostic */}
      <motion.section variants={rise} className="mt-7 px-5">
        <p className="mb-3 text-[12px] text-ink-soft font-semibold">
          {t("what you see when you post dates")}
        </p>
        <div className="overflow-hidden rounded-3xl border border-line bg-white/70">
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <span className="text-[14px] font-semibold">Medellín · mar 12 – 18</span>
            <span className="rounded-full bg-lime px-2.5 py-1 text-[12px] font-semibold">
              {t("9 here")}
            </span>
          </div>
          {[
            { n: "josh m.", d: "mar 10 – 20", w: "surf, coffee", open: true },
            { n: "ana p.", d: "mar 12 – 18", w: "hiking, salsa", open: false },
            { n: "daniel s.", d: "mar 11 – 16", w: "climbing", open: false },
          ].map((r) => (
            <div key={r.n} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
              <span className={`h-9 w-9 shrink-0 rounded-full bg-cream-deep ${r.open ? "" : "blur-[3px]"}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-[14px] font-semibold ${r.open ? "" : "blur-[3px] select-none"}`}>{r.n}</p>
                <p className="text-[12px] text-ink-soft">{r.d} · {r.w}</p>
              </div>
              {r.open ? (
                <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-cream">{t("say hi")}</span>
              ) : (
                <span className="text-[12px] text-ink-soft/60 font-semibold">{t("locked")}</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[12px] text-ink-soft font-semibold">
          {t("first 40 members message everyone free")}
        </p>
      </motion.section>

      {/* the practical strip — NomadTable structure, no cards, divided rows */}
      <motion.section variants={rise} className="mt-6 divide-y divide-line/70 border-y border-line/70">
        {[
          { icon: CalendarPlus, head: t("post your dates, free"), sub: t("30 seconds, no approval, no waiting") },
          { icon: GlobeHemisphereWest, head: t("see who overlaps"), sub: t("every person whose trip crosses yours, day by day") },
          { icon: ShieldCheck, head: t("safe by default"), sub: t("real instagram accounts, women-only mode, block and report 🌸") },
          { icon: Ticket, head: t("message when you want to"), sub: t("replying is free · $19 a trip or $19.99/mo to start one") },
        ].map((r) => (
          <div key={r.head} className="flex items-center gap-4 px-5 py-3.5">
            <r.icon size={20} weight="duotone" className="shrink-0 text-ink" />
            <div className="min-w-0">
              <p className="text-[14.5px] font-medium leading-snug">{r.head}</p>
              <p className="text-[12.5px] leading-snug text-ink-soft">{r.sub}</p>
            </div>
          </div>
        ))}
      </motion.section>

      {/* founder notes — real faces, rotate between the two co-founders */}
      <motion.section variants={rise} className="px-5 py-5">
        <FounderNotes />
      </motion.section>

      <Marquee items={[t("every city"), t("post your dates"), "irl", t("nobody lands alone"), t("women-only mode"), t("free to join"), t("medellín · live")]} />

      {/* compliance footer — pricing, contact, legal (stripe reviewers read this) */}
      <motion.footer variants={rise} className="px-5 py-5 text-center">
        <p className="tabular-nums text-[10px] text-ink-soft">
          free to join and post dates · $19 per trip or $19.99/mo to message ·{" "}
          <a href="/?screen=info" className="underline underline-offset-2">terms</a> ·{" "}
          <a href="mailto:kevincastroperez@gmail.com" className="underline underline-offset-2">contact</a>{" "}
          · © 2026 irlpass
        </p>
      </motion.footer>

      {/* sticky CTA */}
      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-cream via-cream/95 to-transparent px-5 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-6">
        <BigButton onClick={onApply}>
          <span className="flex items-center justify-center gap-2">
            {t("post your dates")} <ArrowRight size={18} weight="bold" />
          </span>
        </BigButton>
        <p className="mt-2.5 text-center text-[12px] text-ink-soft font-semibold">
          {t("free to join · first 40 members message free")}
        </p>
      </div>
    </motion.div>
  )
}
