import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ForkKnife, ShieldCheck, UsersThree, RocketLaunch, ArrowRight } from "@phosphor-icons/react"
import { CITY, MEMBERS, avatarUrl } from "../data"
import { Logo, Squiggle, ColombiaFlag, LiveDot, LiveCounter, AvatarStack, Marquee, BigButton } from "../components/bits"
import { signInWithGoogle } from "../lib/auth"

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
      "half my dms are people asking how to do colombia right. who to trust, where to go, how to not be alone out here. this is the answer i always wished i could send.",
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

const CITIES_SOON = ["miami", "cdmx", "lisboa", "bali"]

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
            open the club →
          </a>
        ) : (
          <button
            onClick={() => signInWithGoogle()}
            className="rounded-full border border-line bg-cream-deep/70 px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft active:scale-95"
          >
            member sign in
          </button>
        )}
      </motion.header>

      {/* the global idea, then city one */}
      <motion.section variants={rise} className="px-5 pt-6">
        <p className="display text-[15px] font-semibold text-ink">the vetted travel club. every city, one club.</p>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" /> medellín · live
          </span>
          {CITIES_SOON.map((c) => (
            <span key={c} className="shrink-0 rounded-full border border-line bg-cream-deep/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft/60">
              {c} · soon
            </span>
          ))}
        </div>
      </motion.section>

      {/* editorial hero — left aligned, squiggle */}
      <motion.section variants={rise} className="px-5 pt-5">
        <div className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ink-soft">
          <ColombiaFlag /> {CITY.country} · {CITY.code}
        </div>
        <h1 className="display mt-1 text-[54px] font-bold leading-[0.95]">
          {CITY.name}
          <Squiggle className="mt-1 w-[190px]" />
        </h1>

        <div className="mt-4 flex items-center gap-2.5 text-[15px]">
          <LiveDot />
          <span className="text-[17px]">
            <LiveCounter start={CITY.travelersNow} />
          </span>
          <span className="text-ink-soft">travelers here right now</span>
        </div>
        <div className="mt-3 flex items-center">
          <AvatarStack extra={`+${CITY.travelersNow - 6} more this month`} />
        </div>
      </motion.section>

      {/* scattered postcards (Travo collage energy) */}
      <motion.section variants={rise} className="relative mt-6 px-5">
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
          { icon: UsersThree, head: "nobody lands alone", sub: "see the plans, tap i'm in, you've got people" },
          { icon: ShieldCheck, head: "every member is vetted", sub: "application, real instagram, no weirdos" },
          { icon: ForkKnife, head: "dinner every thursday", sub: "six seats, members pick the spot" },
          { icon: RocketLaunch, head: "the club app is live", sub: "activity board, city lobby, private chat per plan" },
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

      <Marquee items={["medellín", "vetted", "irl", "thursday dinners", "no tourist traps", "members only"]} />

      {/* compliance footer — pricing, contact, legal (stripe reviewers read this) */}
      <motion.footer variants={rise} className="px-5 py-5 text-center">
        <p className="font-mono text-[10px] text-ink-soft">
          membership $9.99/mo or $69.99/yr ·{" "}
          <a href="/?screen=info" className="underline underline-offset-2">terms</a> ·{" "}
          <a href="mailto:kevincastroperez@gmail.com" className="underline underline-offset-2">contact</a>{" "}
          · © 2026 irlpass
        </p>
      </motion.footer>

      {/* sticky CTA */}
      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-cream via-cream/95 to-transparent px-5 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-6">
        <BigButton onClick={onApply}>
          <span className="flex items-center justify-center gap-2">
            apply to join <ArrowRight size={18} weight="bold" />
          </span>
        </BigButton>
      </div>
    </motion.div>
  )
}
