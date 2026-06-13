import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { AirplaneTakeoff, ShareFat, DoorOpen } from "@phosphor-icons/react"
import { CITY } from "../data"
import { Logo, ColombiaFlag } from "../components/bits"
import { t } from "../lib/i18n"

const BARS = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 5, 1, 2, 2, 1, 4, 1, 3, 1, 1, 2, 5, 1, 2, 3, 1, 1, 4, 2, 1, 3, 1]

function Barcode() {
  let x = 0
  return (
    <svg viewBox="0 0 110 26" className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      {BARS.map((w, i) => {
        const rect = <rect key={i} x={x} y="0" width={w} height="26" fill="#1c1b17" />
        x += w + 1.4
        return rect
      })}
    </svg>
  )
}

// lime confetti shards that spring outward once on mount
function Burst() {
  const shards = [
    { x: -110, y: -150, r: 130, d: 0 },
    { x: 120, y: -120, r: -200, d: 0.05 },
    { x: -150, y: 40, r: 90, d: 0.1 },
    { x: 150, y: 70, r: -120, d: 0.12 },
    { x: -60, y: -210, r: 260, d: 0.16 },
    { x: 70, y: -190, r: -160, d: 0.2 },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {shards.map((s, i) => (
        <motion.span
          key={i}
          className="absolute h-2.5 w-4 rounded-[2px]"
          style={{ background: i % 2 ? "var(--color-lime)" : "var(--color-cream)" }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: s.x, y: s.y, rotate: s.r, opacity: 0 }}
          transition={{ duration: 1.3, delay: 0.45 + s.d, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  )
}

export default function Pass({ applicant }) {
  const memberNo = applicant.memberNo || String(29 + (applicant.name.length % 7)).padStart(3, "0")
  const [copied, setCopied] = useState(false)

  // arriving from stripe: confirm payment server-side so the token unlocks the club
  const params = new URLSearchParams(window.location.search)
  const token = params.get("t")
  const sessionId = params.get("session_id")
  const [activated, setActivated] = useState(!sessionId)
  useEffect(() => {
    if (token && sessionId) {
      fetch(`/api/activate?t=${token}&session_id=${encodeURIComponent(sessionId)}`)
        .then(() => setActivated(true))
        .catch(() => setActivated(true))
    }
    if (token) localStorage.setItem("irlpass_member_token", token)
  }, [token, sessionId])

  const sharePass = async () => {
    const payload = {
      title: "irlpass",
      text: `i'm founding member nº ${memberNo} of irlpass.`,
      url: "https://irlpass.xyz",
    }
    try {
      if (navigator.share) {
        await navigator.share(payload)
      } else {
        await navigator.clipboard.writeText(`${payload.text} ${payload.url}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2200)
      }
    } catch {
      // user closed the share sheet
    }
  }
  return (
    <div className="relative flex min-h-[var(--app-h)] flex-col overflow-hidden bg-ink px-5 text-cream">
      <Burst />

      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-12">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-cream/50"
        >
          {t("application approved")}
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.2 }}
          className="display mt-1 text-[50px] font-bold leading-none"
        >
          {t("you're")} <em className="italic text-lime">{t("in")}</em>.
        </motion.h2>
      </header>

      {/* the pass — boarding-pass artifact, springs in with overshoot */}
      <motion.section
        initial={{ opacity: 0, y: 90, rotate: 7, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, rotate: -2, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 13, delay: 0.5 }}
        className="mx-auto mt-9 w-full max-w-[340px] rounded-3xl bg-lime text-ink shadow-[0_30px_60px_-20px_rgba(205,238,69,0.35)]"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <Logo text size="text-[18px]" pill="bg-ink text-lime" />
          <span className="rounded-full bg-ink px-3 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-lime">
            {parseInt(memberNo, 10) <= 52 ? t("founding member") : t("member")}
          </span>
        </div>

        <div className="px-6 pb-5 pt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/55">{t("member")}</p>
          <p className="display text-[32px] leading-tight">{applicant.name.toLowerCase()}</p>
          <p className="mt-0.5 font-mono text-[12px] text-ink/65">{applicant.ig}</p>

          <div className="mt-6 flex items-end justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/55">{t("access")}</p>
              <p className="font-mono text-[26px] font-semibold tracking-tight">{t("all cities")}</p>
            </div>
            <AirplaneTakeoff size={24} weight="duotone" className="mb-1 text-ink/70" />
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/55">nº</p>
              <p className="font-mono text-[26px] font-semibold tracking-tight">{memberNo}</p>
            </div>
          </div>
        </div>

        {/* perforation */}
        <div className="relative flex items-center" aria-hidden>
          <span className="absolute -left-3 h-6 w-6 rounded-full bg-ink" />
          <span className="mx-5 w-full border-t-2 border-dashed border-ink/25" />
          <span className="absolute -right-3 h-6 w-6 rounded-full bg-ink" />
        </div>

        <div className="px-6 pb-6 pt-4">
          <Barcode />
          <p className="mt-2 text-center font-mono text-[9.5px] uppercase tracking-[0.22em] text-ink/55">
            {t("membership verified · valid in every irlpass city")}
          </p>
        </div>
      </motion.section>

      <footer className="mt-auto pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8">
        <motion.a
          href={token ? `/?screen=app&t=${token}` : "/?screen=app"}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          whileTap={{ scale: 0.97 }}
          className={`flex w-full items-center justify-center gap-2 rounded-full bg-lime px-6 py-4 text-[15px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)] ${activated ? "" : "pointer-events-none opacity-60"}`}
        >
          <DoorOpen size={19} weight="fill" /> {activated ? t("enter the club") : t("unlocking…")}
        </motion.a>
        <motion.button
          onClick={sharePass}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.12 }}
          whileTap={{ scale: 0.97 }}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-cream/20 px-6 py-3.5 text-[14px] font-semibold text-cream"
        >
          <ShareFat size={17} weight="fill" /> {copied ? t("copied. paste it anywhere") : t("share your pass")}
        </motion.button>
      </footer>
    </div>
  )
}
