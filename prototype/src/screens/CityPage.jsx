import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, ChatCircleDots, GlobeHemisphereWest, Ticket, ArrowRight } from "@phosphor-icons/react"
import { CITIES, TRAVELERS_NOW } from "../data"
import { Logo, Squiggle, LiveDot, LiveCounter, AvatarStack, Marquee, BigButton } from "../components/bits"
import { signInWithGoogle } from "../lib/auth"
import { t } from "../lib/i18n"

const POSTCARDS = [
  { src: "/medellin/guatape.jpg", alt: "guatapé day trip", rot: -7, x: "-2%", y: 0, delay: 0.25 },
  { src: "/medellin/night-terraza.jpg", alt: "thursday night, members table", rot: 4, x: "0%", y: 14, delay: 0.38 },
  { src: "/medellin/rooftop.jpg", alt: "rooftop in el poblado", rot: -3, x: "2%", y: -6, delay: 0.51 },
]

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
      "we got tired of landing in cities where the only people you meet are trying to sell you something. so we're building the members club we wished existed. and the first 50 build it with us.",
  },
  {
    img: "/josh.jpg",
    name: "josh mac",
    ig: "jawshmac",
    title: "co-founder · member 002",
    note:
      "half my dms are people asking how to travel a place right. who to trust, where to go, how to not be alone out there. this is the answer i always wished i could send.",
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
                  {f.name} <span className="font-mono text-[10.5px] font-medium text-ink-soft">@{f.ig}</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{f.title}</p>
              </div>
            </a>
            <span className="ml-auto rounded-full bg-lime px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink">
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
            className="rounded-full bg-ink px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-lime"
          >
            {t("open the club →")}
          </a>
        ) : (
          <button
            onClick={() => signInWithGoogle()}
            className="rounded-full border border-line bg-cream-deep/70 px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft active:scale-95"
          >
            {t("member sign in")}
          </button>
        )}
      </motion.header>

      {/* brand-led hero — global value prop, then social proof */}
      <motion.section variants={rise} className="px-5 pt-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ink-soft">
          {t("the vetted travel club")}
        </p>
        <h1 className="display mt-2 max-w-[9ch] text-[52px] font-bold leading-[0.95]">
          {t("nobody lands alone")}
          <Squiggle className="mt-1 w-[200px]" />
        </h1>
        <p className="mt-4 max-w-[22rem] text-[15.5px] leading-relaxed text-ink-soft">
          {t("wherever you travel, there's already people. every city, one club.")}
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
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-ink" /> {c.name} · {t("live")}
              </span>
            ) : (
              <span
                key={c.name}
                className="shrink-0 rounded-full border border-line bg-cream-deep/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft/60"
              >
                {c.name} · {t("soon")}
              </span>
            )
          )}
        </div>
      </motion.section>

      {/* scattered postcards — medellín as proof-of-life, not the ceiling */}
      <motion.section variants={rise} className="relative mt-7 px-5">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t("city one · medellín · live now")}
        </p>
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/50 blur-3xl"
          aria-hidden
        />
        <div className="relative grid grid-cols-3 gap-2">
          {POSTCARDS.map((p) => (
            <motion.div
              key={p.src}
              initial={{ opacity: 0, y: 26, rotate: 0 }}
              animate={{ opacity: 1, y: p.y, rotate: p.rot }}
              transition={{ type: "spring", stiffness: 120, damping: 16, delay: p.delay }}
              className="overflow-hidden rounded-xl border border-line bg-white p-1 shadow-[0_14px_28px_-18px_rgba(28,27,23,0.45)]"
              style={{ x: p.x }}
            >
              <img src={p.src} alt={p.alt} className="aspect-[3/4] w-full rounded-lg object-cover" />
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* the practical strip — NomadTable structure, no cards, divided rows */}
      <motion.section variants={rise} className="mt-6 divide-y divide-line/70 border-y border-line/70">
        {[
          { icon: ChatCircleDots, head: t("free in your city"), sub: t("see what's happening, make plans, group chat per activity") },
          { icon: GlobeHemisphereWest, head: t("browse the whole map"), sub: t("every city, wherever you travel") },
          { icon: ShieldCheck, head: t("vetted + safe"), sub: t("real members, reputation, women-only plans 🌸") },
          { icon: Ticket, head: t("travel mode"), sub: t("the pass unlocks hosting anywhere + dms with anyone") },
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

      <Marquee items={[t("every city"), t("vetted"), "irl", t("nobody lands alone"), t("women-only plans"), t("members only"), t("medellín · live")]} />

      {/* compliance footer — pricing, contact, legal (stripe reviewers read this) */}
      <motion.footer variants={rise} className="px-5 py-5 text-center">
        <p className="font-mono text-[10px] text-ink-soft">
          free to join · the pass unlocks every city + dms · $9.99/mo or $69.99/yr ·{" "}
          <a href="/?screen=info" className="underline underline-offset-2">terms</a> ·{" "}
          <a href="mailto:kevincastroperez@gmail.com" className="underline underline-offset-2">contact</a>{" "}
          · © 2026 irlpass
        </p>
      </motion.footer>

      {/* sticky CTA */}
      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-cream via-cream/95 to-transparent px-5 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-6">
        <BigButton onClick={onApply}>
          <span className="flex items-center justify-center gap-2">
            {t("apply to join")} <ArrowRight size={18} weight="bold" />
          </span>
        </BigButton>
        <p className="mt-2.5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
          {t("free in your city · the pass unlocks the rest")}
        </p>
      </div>
    </motion.div>
  )
}
