import { motion } from "framer-motion"
import { CheckCircle, InstagramLogo } from "@phosphor-icons/react"
import { CITY } from "../data"

export default function Received({ applicant }) {
  return (
    <div className="flex min-h-[var(--app-h)] flex-col px-7">
      <div className="flex flex-1 flex-col items-start justify-center">
        <motion.span
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
        >
          <CheckCircle size={52} weight="fill" className="text-lime-deep" />
        </motion.span>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ink-soft"
        >
          application received · {applicant.ig}
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.32 }}
          className="display mt-1.5 text-[42px] font-bold leading-[1.02]"
        >
          you're on the list.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-ink-soft"
        >
          every application gets read by an actual founder, usually over coffee. if you're in,
          you'll get a private link with the founding member offer: what we're building, what it
          costs, how to claim your spot. decisions usually land within 24 hours.
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-7 rounded-full border border-line bg-cream-deep/70 px-4 py-2 font-mono text-[11px] text-ink-soft"
        >
          50 founding spots
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75 }}
        className="pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <a
          href="https://instagram.com/irlpass.xyz"
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-[15px] font-semibold text-cream active:scale-[0.98]"
        >
          <InstagramLogo size={18} weight="bold" /> watch us build it
        </a>
        <p className="mt-3 text-center font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft/70">
          go pack. we'll email you.
        </p>
      </motion.div>
    </div>
  )
}
