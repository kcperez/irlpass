import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CircleNotch, CheckCircle } from "@phosphor-icons/react"

const CHECKS = [
  { label: "checking your instagram is real", at: 900 },
  { label: "matching you with members in medellín", at: 1900 },
  { label: "reviewing this week's table space", at: 2800 },
]

export default function Review({ applicant, onAccepted }) {
  const [done, setDone] = useState(0)

  useEffect(() => {
    const timers = CHECKS.map((c, i) => setTimeout(() => setDone(i + 1), c.at))
    const finish = setTimeout(onAccepted, 3900)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(finish)
    }
  }, [onAccepted])

  return (
    <div className="flex min-h-[var(--app-h)] flex-col items-start justify-center px-7">
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ink-soft"
      >
        application · {applicant.ig}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="display mt-2 text-[36px] leading-tight"
      >
        hold on, {applicant.name.toLowerCase()}.
      </motion.h2>

      <div className="mt-10 flex flex-col gap-4">
        {CHECKS.map((c, i) => {
          const isDone = done > i
          const isActive = done === i
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: isDone || isActive ? 1 : 0.35, x: 0 }}
              transition={{ delay: 0.25 + i * 0.12 }}
              className="flex items-center gap-3"
            >
              {isDone ? (
                <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 16 }}>
                  <CheckCircle size={22} weight="fill" className="text-lime-deep" />
                </motion.span>
              ) : (
                <motion.span
                  animate={isActive ? { rotate: 360 } : {}}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                  className="flex"
                >
                  <CircleNotch size={22} weight="bold" className="text-ink-soft" />
                </motion.span>
              )}
              <span className={`text-[15px] ${isDone ? "text-ink" : "text-ink-soft"}`}>{c.label}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
