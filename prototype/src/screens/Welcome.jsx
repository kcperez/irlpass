import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, InstagramLogo } from "@phosphor-icons/react"
import { LiveCounter } from "../components/bits"
import { TRAVELERS_NOW } from "../data"
import { t } from "../lib/i18n"

// the whole pitch in one glance: never travel alone, drop your instagram, go.
export default function Welcome({ onStart }) {
  const [ig, setIg] = useState("")
  const memberToken = typeof localStorage !== "undefined" && localStorage.getItem("irlpass_member_token")
  const handle = ig.replace(/^@+/, "").trim()

  return (
    <div className="relative flex min-h-[var(--app-h)] flex-col overflow-hidden lg:justify-center">
      {/* soft blobs behind everything */}
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-10 h-56 w-56 rounded-full bg-lime/70 blur-3xl lg:h-96 lg:w-96" />
      <div aria-hidden className="pointer-events-none absolute -right-20 top-24 h-52 w-52 rounded-full bg-peach/70 blur-3xl lg:h-96 lg:w-96" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:absolute lg:inset-x-0 lg:top-0 lg:px-10 lg:pt-8">
        <span className="display text-[22px] font-bold lowercase tracking-tight lg:text-[26px]">
          irl<span className="ml-[3px] inline-block -rotate-3 rounded-[0.45em] bg-lime px-[0.3em] pb-[0.06em] leading-none">pass</span>
        </span>
        {memberToken && (
          <a href={`/?screen=app&t=${memberToken}`} className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-cream">
            {t("open")}
          </a>
        )}
      </header>

      {/* phone: stacked. desktop: text left, art right, all on one horizon. */}
      <div className="relative z-10 flex flex-1 flex-col lg:grid lg:min-h-0 lg:flex-none lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12 lg:px-10">
        <div className="flex flex-col lg:order-1">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 18 }}
            className="display mt-5 whitespace-nowrap px-5 font-bold leading-[0.95] tracking-[-0.035em] lg:mt-0 lg:px-0"
            style={{ fontSize: "clamp(30px, 8.2vw, 58px)" }}
          >
            {t("never travel")}{" "}
            <span className="relative inline-block">
              {t("alone")}
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -bottom-0.5 left-0 h-[0.14em] w-full origin-left rounded-full bg-lime"
                aria-hidden
              />
            </span>
          </motion.h1>

          <p className="mt-3 px-5 text-[16px] text-ink-soft lg:px-0 lg:text-[19px]">
            {t("drop your instagram, post your dates, see who's there.")}
          </p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 140, damping: 20 }}
            className="mt-auto flex flex-col gap-2 px-5 pb-[max(1.1rem,env(safe-area-inset-bottom))] lg:mt-7 lg:max-w-[440px] lg:px-0 lg:pb-0"
          >
            <div className="flex items-center gap-2 rounded-[1.6rem] border-2 border-ink bg-white/85 px-4 py-3 shadow-[0_18px_40px_-24px_rgba(58,50,44,0.7)]">
              <InstagramLogo size={22} weight="duotone" className="shrink-0" />
              <span className="text-[17px] font-semibold text-ink-soft">@</span>
              <input
                id="welcome-ig"
                value={ig}
                onChange={(e) => setIg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handle.length > 2 && onStart(handle)}
                autoCapitalize="none" autoCorrect="off" spellCheck="false"
                placeholder={t("your instagram")}
                className="w-full bg-transparent text-[17px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50"
              />
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={handle.length < 3}
              onClick={() => onStart(handle)}
              className="flex items-center justify-center gap-2 rounded-full bg-ink py-4 text-[17px] font-bold text-cream disabled:opacity-40"
            >
              {t("see who's around")} <ArrowRight size={18} weight="bold" />
            </motion.button>

            <div className="flex items-center justify-between gap-1 pt-2">
              {[
                { art: "/art/icon-dates.png", label: t("post your dates") },
                { art: "/art/icon-people.png", label: t("see who overlaps") },
                { art: "/art/icon-chat.png", label: t("say hi") },
              ].map((x, i) => (
                <div key={x.label} className="flex flex-1 items-center gap-1.5">
                  <img src={x.art} alt="" className="h-9 w-9 shrink-0" draggable="false" />
                  <span className="text-[12px] font-semibold leading-tight">{x.label}</span>
                  {i < 2 && <span className="text-ink-soft/40">›</span>}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 pt-0.5 text-[12px] text-ink-soft lg:justify-start">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-deep" />
              <LiveCounter start={TRAVELERS_NOW} /> {t("travelers in medellín, cdmx, lisbon, miami + bali")}
            </div>
          </motion.div>
        </div>

        <motion.img
          src="/art/hero.png"
          alt=""
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 110, damping: 18, delay: 0.1 }}
          className="mx-auto w-[94%] max-w-[420px] flex-1 select-none object-contain lg:order-2 lg:w-full lg:max-w-none lg:flex-none"
          draggable="false"
        />
      </div>
    </div>
  )
}
