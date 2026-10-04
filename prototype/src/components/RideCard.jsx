import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CircleNotch } from "@phosphor-icons/react"
import { cachedJson } from "../lib/cached"
import { t } from "../lib/i18n"

// the guaranteed ride: a date, a price, seats running out. members only, so
// the free month is the gate and the seat is the payoff.
const fmtNight = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()

export default function RideCard({ token, city = "medellin", onBuy, compact = false }) {
  const [rides, setRides] = useState([])
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    cachedJson(`/api/rides?t=${token}&city=${city}`, (d) => setRides(d.rides || [])).catch(() => {})
  }, [token, city])
  if (!rides.length) return null
  return (
    <div className={compact ? "space-y-2" : "mt-3 space-y-2"}>
      {rides.map((r) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[1.5rem] bg-ink p-4 text-cream shadow-[0_14px_34px_-16px_rgba(58,50,44,0.8)]"
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-lime/30 blur-2xl" />
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cream/60">🚐 {t("members only")} · {fmtNight(r.night)}</p>
          <p className="display mt-0.5 text-[21px] font-bold leading-tight">{r.title}</p>
          {r.depart && <p className="text-[13px] text-cream/80">{r.depart}</p>}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[12.5px] font-bold">
              ${Math.round(r.price / 100)} · {r.left > 0 ? `${r.left} ${t("of")} ${r.seats} ${t("seats left")}` : t("sold out")}
            </p>
            {r.mine ? (
              <span className="rounded-full bg-lime px-3.5 py-2 text-[12.5px] font-bold text-ink">✓ {t("you have a seat")}</span>
            ) : r.left > 0 ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={async () => { setBusy(r.id); await onBuy?.(r.id); setBusy(null) }}
                className="rounded-full bg-cream px-4 py-2 text-[13px] font-bold text-ink"
              >
                {busy === r.id ? <CircleNotch size={14} className="animate-spin" /> : t("get a seat")}
              </motion.button>
            ) : null}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
