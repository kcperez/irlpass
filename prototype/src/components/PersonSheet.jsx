import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle, CircleNotch, LockSimple, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { cityChip } from "../lib/cities"
import { countryOf } from "../lib/countries"
import { vibeEmoji, vibeLabel } from "../lib/vibes"

// tap someone and see who they are: where they're from, when they're around,
// what they're into, whether they're out tonight. one button at the bottom.
const fmt = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()

export default function PersonSheet({ token, memberNo, onClose, onMessage, onUnlock }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    fetch(`/api/person?t=${token}&no=${memberNo}`)
      .then((r) => r.json())
      .then(setP)
      .catch(() => setP({ error: true }))
  }, [token, memberNo])

  const c = p && countryOf(p.country)
  const sharedSet = new Set((p?.shared || []).map((x) => String(x).toLowerCase()))

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="fixed inset-x-0 bottom-0 top-8 z-50 mx-auto flex max-w-[460px] flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
      >
        {!p ? (
          <div className="flex flex-1 items-center justify-center"><CircleNotch size={24} className="animate-spin text-ink-soft" /></div>
        ) : p.error ? (
          <div className="flex flex-1 items-center justify-center text-[14px] text-ink-soft">{t("could not load them")}</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="relative aspect-[4/4.2] w-full overflow-hidden bg-cream-deep">
                {p.photo && (
                  <motion.img
                    initial={{ scale: 1.06, opacity: 0 }} animate={{ scale: p.locked ? 1.08 : 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    src={p.photo} alt=""
                    className={`h-full w-full object-cover ${p.locked ? "blur-[3px]" : ""}`}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <button onClick={onClose} aria-label={t("close")} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-cream backdrop-blur">
                  <X size={18} weight="bold" />
                </button>
                {p.out && (
                  <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-bold text-cream shadow-lg">
                    <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5fd35f] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#5fd35f]" /></span>
                    {t("going out tn")}{p.out.area ? ` · ${p.out.area}` : ""}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-5 text-cream">
                  <h2 className="display flex items-center gap-2 text-[34px] font-bold leading-[0.95] tracking-tight">
                    {p.locked ? p.first : p.name || p.first}
                    {p.verified && <CheckCircle size={22} weight="fill" className="text-lime" />}
                    {p.locked && <LockSimple size={18} weight="fill" className="text-cream/70" />}
                  </h2>
                  <p className="mt-1 text-[14px] font-semibold text-cream/90">
                    {[c && `${c.flag} ${t("from")} ${c.label}`, p.home && `${t("lives in")} ${p.home}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              <div className="space-y-5 px-5 pb-6 pt-5">
                {p.out?.spots?.length > 0 && (
                  <section className="rounded-[1.4rem] bg-ink px-4 py-3 text-cream">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cream/60">{t("tonight")}</p>
                    <p className="mt-0.5 text-[15px] font-bold">{t("going to")} {p.out.spots.join(" + ")}</p>
                  </section>
                )}

                {p.trips.length > 0 && (
                  <section>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("their dates")}</p>
                    <div className="mt-2 space-y-2">
                      {p.trips.map((tr, i) => (
                        <motion.div
                          key={`${tr.city}-${tr.starts}`}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.05 }}
                          className="flex items-center gap-3 rounded-[1.3rem] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_24px_-12px_rgba(58,50,44,0.25)]"
                        >
                          <span className="text-[26px] leading-none">{cityChip(tr.city).emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold leading-tight">{tr.cityName}</p>
                            <p className="text-[12.5px] text-ink-soft">
                              {tr.local ? t("lives here") : `${fmt(tr.starts)} – ${fmt(tr.ends)}`}
                              {tr.flexible && !tr.local ? ` · ${t("flexible")}` : ""}
                              {tr.area ? ` · 📍 ${tr.area}` : ""}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {p.vibes.length > 0 && (
                  <section>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("into")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.vibes.map((v) => {
                        const both = sharedSet.has(String(v).toLowerCase())
                        return (
                          <span key={v} className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${both ? "bg-lime text-ink ring-2 ring-ink" : "bg-white text-ink shadow-sm"}`}>
                            {vibeEmoji(v)} {vibeLabel(v)}
                          </span>
                        )
                      })}
                    </div>
                    {p.shared.length > 0 && <p className="mt-1.5 text-[12px] font-semibold text-ink-soft">{t("outlined: you're both into it")}</p>}
                  </section>
                )}

                {(p.been.length > 0 || p.since) && (
                  <section className="text-[13px] text-ink-soft">
                    {p.been.length > 0 && <p>{t("been to")} {p.been.join(", ")}</p>}
                    {p.since && <p>{t("on irlpass since")} {new Date(p.since).toLocaleDateString(undefined, { month: "long", year: "numeric" }).toLowerCase()}</p>}
                    {p.ig && <p className="mt-1 font-semibold text-ink">{p.ig}</p>}
                  </section>
                )}
              </div>
            </div>

            {!p.self && (
              <div className="border-t border-line/70 bg-cream/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                {p.canMessage ? (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => onMessage?.(p)} className="w-full rounded-full bg-ink py-4 text-[15px] font-bold text-cream shadow-[0_12px_28px_-12px_rgba(58,50,44,0.7)]">
                    {p.talked ? t("open chat") : `${t("say hi to")} ${p.first}`}
                  </motion.button>
                ) : (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => onUnlock?.(p)} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[15px] font-bold text-cream">
                    <LockSimple size={16} weight="fill" /> {t("unlock to say hi")}
                  </motion.button>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </>
  )
}
