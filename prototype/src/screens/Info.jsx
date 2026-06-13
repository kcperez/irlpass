import { ArrowLeft } from "@phosphor-icons/react"
import { Logo } from "../components/bits"

const SECTIONS = [
  {
    h: "what irlpass is",
    p: "irlpass is a members-only travel community. members apply, get reviewed by a real person, and join a vetted city community with a members group chat, weekly member dinners, and meetups. our first city is medellín, colombia. a mobile app is in development; founding members get access at launch.",
  },
  {
    h: "pricing",
    p: "membership is a subscription: $9.99 usd per month, or $69.99 usd per year. cancel anytime. meals, drinks, and activities at member meetups are paid by each member directly. prices are shown at checkout before any payment. payments are processed securely by stripe.",
  },
  {
    h: "refund policy",
    p: "if you're not happy with your membership, email us within 7 days of purchase and we'll refund you in full, no questions asked. after 7 days, refunds are handled case by case. to request a refund, email kevincastroperez@gmail.com with the email you used at checkout.",
  },
  {
    h: "terms of membership",
    p: "membership is personal and non-transferable. we review every application and accept members at our discretion. members who harass others, treat the community as a dating or hookup service, or put other members at risk are removed. removal for conduct violations within the first 7 days is refunded; after that, it isn't. we organize meetups but each member is responsible for their own safety, travel, and expenses.",
  },
  {
    h: "privacy",
    p: "we collect what you give us when applying: your name, instagram handle, email, travel dates, and interests. we use it to review your application and run the community. we don't sell your data. payment details go to stripe and never touch our servers. to have your data deleted, email us.",
  },
  {
    h: "contact",
    p: "irlpass · kevincastroperez@gmail.com · we usually reply within 24 hours.",
  },
]

export default function Info({ onBack }) {
  return (
    <div className="flex min-h-[var(--app-h)] flex-col px-6 pb-10">
      <header className="flex items-center justify-between pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-12">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/60 active:scale-95"
          aria-label="back"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <Logo size="text-[19px]" />
        <span className="w-10" />
      </header>

      <h1 className="display mt-8 text-[34px] font-bold leading-tight">the fine print.</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft">everything stripe, your lawyer, and your mom would want to know.</p>

      <div className="mt-7 space-y-7">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">{s.h}</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{s.p}</p>
          </section>
        ))}
      </div>

      <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/70">
        © 2026 irlpass · medellín is city one
      </p>
    </div>
  )
}
