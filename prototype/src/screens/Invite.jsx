import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CircleNotch, ArrowRight } from "@phosphor-icons/react"
import { Logo } from "../components/bits"
import { t } from "../lib/i18n"

// public invite page: what non-members see when a member sends them a plan
export default function Invite({ activityId, onApply }) {
  const [inv, setInv] = useState(null)
  const [state, setState] = useState("loading")

  useEffect(() => {
    if (!activityId) return setState("invalid")
    fetch(`/api/invite?a=${activityId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setInv(d); setState("ok") })
      .catch(() => setState("invalid"))
  }, [activityId])

  if (state === "loading") {
    return <div className="flex min-h-[var(--app-h)] items-center justify-center"><CircleNotch size={24} className="animate-spin text-ink-soft" /></div>
  }

  return (
    <div className="flex min-h-[var(--app-h)] flex-col bg-ink px-6 text-cream">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-12">
        <Logo h="h-10" />
      </header>

      <main className="flex flex-1 flex-col justify-center pb-10">
        {state === "invalid" ? (
          <>
            <h1 className="display text-[34px] font-bold leading-tight">{t("this invite expired.")}</h1>
            <p className="mt-2 text-[14px] text-ink-soft text-cream/60">the plan's gone, but the club isn't.</p>
          </>
        ) : (
          <>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-lime"
            >
              {t("you're invited")}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.1 }}
              className="display mt-1.5 text-[36px] font-bold leading-[1.05]"
            >
              {inv.host.toLowerCase()} wants you at<br />
              <em className="italic text-lime">{inv.title.toLowerCase()}</em>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="mt-3 font-mono text-[12px] uppercase tracking-[0.12em] text-cream/60"
            >
              {inv.when}{inv.place ? ` · ${inv.place}` : ""} · {inv.going} going
              {inv.spotsLeft !== null ? ` · ${inv.spotsLeft} spots left` : ""}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="mt-7 rounded-2xl border border-cream/12 bg-cream/[0.04] p-5"
            >
              <p className="text-[14px] leading-relaxed text-cream/80">
                this plan lives inside irlpass, a members-only travel club. apply, get vetted by a
                real person, and you're in the room where these plans happen.
              </p>
            </motion.div>
          </>
        )}
      </main>

      <footer className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <motion.button
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          whileTap={{ scale: 0.97 }}
          onClick={onApply}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-lime px-6 py-4 text-[15px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)]"
        >
          {t("apply to join irlpass")} <ArrowRight size={18} weight="bold" />
        </motion.button>
        <button
          onClick={() => { localStorage.setItem("irlpass_member_token", ""); window.location.href = "/api/google-login" }}
          className="mt-3 w-full text-center font-mono text-[11px] uppercase tracking-[0.12em] text-cream/55 underline underline-offset-2 active:scale-[0.98]"
        >
          {t("already a member? sign in")}
        </button>
        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-cream/40">
          {t("members only · every application read by a founder")}
        </p>
      </footer>
    </div>
  )
}
