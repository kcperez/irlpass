import { motion } from "framer-motion"
import { GoogleLogo } from "@phosphor-icons/react"
import { Logo } from "../components/bits"
import { signInWithGoogle } from "../lib/auth"
import { t } from "../lib/i18n"

// status page after google sign-in for people not yet members
// members and accepted applicants never see this — they get redirected straight in
export default function Auth() {
  const params = new URLSearchParams(window.location.search)
  const state = params.get("s") || "error"
  const name = params.get("name") || ""

  return (
    <div className="flex min-h-[var(--app-h)] flex-col items-start justify-center px-7">
      <Logo h="h-10" />
      {state === "applied" ? (
        <>
          <h2 className="display mt-5 text-[30px] font-bold leading-tight">
            {name ? `${name.toLowerCase()}, you're` : "you're"} in review.
          </h2>
          <p className="mt-2 max-w-[32ch] text-[14px] leading-relaxed text-ink-soft">
            your application is in. a founder reads every single one. decisions usually land within 24 hours.
          </p>
        </>
      ) : state === "none" ? (
        <>
          <h2 className="display mt-5 text-[30px] font-bold leading-tight">no application yet.</h2>
          <p className="mt-2 max-w-[32ch] text-[14px] leading-relaxed text-ink-soft">
            this email isn't in our system. apply first, it takes a minute.
          </p>
          <a href="/" className="mt-6 rounded-full bg-lime px-6 py-3.5 text-[14px] font-semibold text-ink">apply to join</a>
        </>
      ) : (
        <>
          <h2 className="display mt-5 text-[30px] font-bold leading-tight">sign-in hiccup.</h2>
          <p className="mt-2 text-[14px] text-ink-soft">try again, it usually works the second time.</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={signInWithGoogle}
            className="mt-6 flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[14px] font-semibold text-cream"
          >
            <GoogleLogo size={18} weight="bold" /> continue with google
          </motion.button>
        </>
      )}
    </div>
  )
}
