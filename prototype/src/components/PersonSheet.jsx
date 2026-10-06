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

// a passport stamp: "medellín · oct 26", slightly turned, in its own ink
const INKS = ["#3d6fd6", "#d9653b", "#2f8f5b", "#8a4fd0", "#c2417a"]
const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }).toLowerCase().replace(" ", " '")
export function Stamp({ s, i = 0, small = false }) {
  const ink = INKS[(s.city.length + i) % INKS.length]
  return (
    <span
      style={{ color: ink, borderColor: ink, transform: `rotate(${[-4, 3, -2, 5][i % 4]}deg)` }}
      className={`inline-flex shrink-0 flex-col items-center rounded-[0.6rem] border-2 border-dashed bg-white/60 font-mono font-bold uppercase leading-tight ${small ? "px-1.5 py-0.5 text-[8.5px]" : "px-2.5 py-1 text-[10.5px]"}`}
    >
      <span>{cityChip(s.city).emoji} {s.cityName}</span>
      <span className="opacity-75">{monthLabel(s.month)}</span>
    </span>
  )
}

export default function PersonSheet({ token, memberNo, onClose, onMessage, onUnlock }) {
  const [p, setP] = useState(null)
  // tapping a connection opens their profile in the same sheet
  const [viewNo, setViewNo] = useState(memberNo)
  const [hideConn, setHideConn] = useState(null)
  useEffect(() => {
    setP(null)
    fetch(`/api/person?t=${token}&no=${viewNo}`)
      .then((r) => r.json())
      .then((d) => { setP(d); setHideConn(!!d.hideConnections) })
      .catch(() => setP({ error: true }))
  }, [token, viewNo])

  const toggleHide = async () => {
    const next = !hideConn
    setHideConn(next)
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, hideConnections: next }),
    }).catch(() => {})
  }

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
                {viewNo !== memberNo && (
                  <button onClick={() => setViewNo(memberNo)} className="absolute left-3 top-3 z-10 rounded-full bg-black/40 px-3 py-1.5 text-[12px] font-bold text-cream backdrop-blur">
                    ← {t("back")}
                  </button>
                )}
                <button onClick={onClose} aria-label={t("close")} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-cream backdrop-blur">
                  <X size={18} weight="bold" />
                </button>
                {p.out && (
                  <span className={`absolute left-3 ${viewNo !== memberNo ? "top-14" : "top-3"} flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-bold text-cream shadow-lg`}>
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
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{p.self ? t("your dates") : t("their dates")}</p>
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
                              {tr.hidden ? ` · 🙈 ${t("hidden")}` : ""}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {p.together && (
                  <section className="rounded-[1.4rem] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_24px_-12px_rgba(58,50,44,0.25)]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("you and")} {p.first}</p>
                    <p className="mt-0.5 text-[15px] font-bold">
                      {p.together.nights > 0
                        ? `${p.together.nights} ${p.together.nights === 1 ? t("night out together") : t("nights out together")}`
                        : t("you've talked on irlpass")}
                    </p>
                    {p.together.stamps.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {p.together.stamps.map((x, i) => <Stamp key={`${x.city}-${x.month}`} s={x} i={i} />)}
                      </div>
                    )}
                  </section>
                )}
                {!p.self && p.mutual > 0 && (
                  <p className="-mt-2 text-[13px] font-semibold text-ink-soft">
                    🤝 {p.mutual} {p.mutual === 1 ? t("connection in common") : t("connections in common")}
                  </p>
                )}

                {p.vibes.length > 0 && (
                  <section>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("into")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.vibes.map((v) => {
                        const both = !p.self && sharedSet.has(String(v).toLowerCase())
                        return (
                          <span key={v} className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${both ? "bg-lime text-ink ring-2 ring-ink" : "bg-white text-ink shadow-sm"}`}>
                            {vibeEmoji(v)} {vibeLabel(v)}
                          </span>
                        )
                      })}
                    </div>
                    {!p.self && p.shared.length > 0 && <p className="mt-1.5 text-[12px] font-semibold text-ink-soft">{t("outlined: you're both into it")}</p>}
                  </section>
                )}

                {p.stamps?.length > 0 && (
                  <section>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("stamps")}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2.5">
                      {p.stamps.map((x, i) => (
                        <motion.span key={`${x.city}-${x.month}`} initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 420, damping: 18 }}>
                          <Stamp s={x} i={i} />
                        </motion.span>
                      ))}
                    </div>
                  </section>
                )}

                {p.self && (
                  <section>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("your connections")}</p>
                    {p.connections.length === 0 ? (
                      <p className="mt-1.5 text-[13px] text-ink-soft">{t("everyone you talk to or go out with on irlpass shows up here.")}</p>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2.5">
                        {p.connections.map((c, i) => (
                          <motion.button
                            key={c.memberNo}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setViewNo(c.memberNo)}
                            className="flex flex-col items-center rounded-[1.4rem] bg-white px-3 pb-3 pt-4 text-center shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_24px_-12px_rgba(58,50,44,0.25)]"
                          >
                            <div className="h-16 w-16 overflow-hidden rounded-full bg-cream-deep">
                              {c.photo && <img src={c.photo} alt="" onError={(e) => { e.currentTarget.style.display = "none" }} className={`h-full w-full object-cover ${c.locked ? "scale-105 blur-[2px]" : ""}`} />}
                            </div>
                            <p className="mt-2 text-[15px] font-bold leading-tight">{c.first} {countryOf(c.country)?.flag}</p>
                            <p className="text-[11.5px] text-ink-soft">
                              {c.nights > 0 ? `${c.nights} ${c.nights === 1 ? t("night out together") : t("nights out together")}` : t("you've talked")}
                            </p>
                            {c.stamps.length > 0 && (
                              <div className="mt-2 flex flex-wrap justify-center gap-1">
                                {c.stamps.slice(0, 2).map((x, j) => <Stamp key={`${x.city}-${x.month}`} s={x} i={j} small />)}
                              </div>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    )}
                    <button onClick={toggleHide} className="mt-3 flex w-full items-center justify-between rounded-[1.2rem] border-2 border-line bg-white/70 px-4 py-3 text-left">
                      <span className="text-[13px] font-semibold">{t("show me in other people's connections")}</span>
                      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${hideConn ? "bg-line" : "bg-ink"}`}>
                        <motion.span layout className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream shadow ${hideConn ? "left-0.5" : "left-[18px]"}`} />
                      </span>
                    </button>
                  </section>
                )}

                {(p.since || p.ig) && (
                  <section className="text-[13px] text-ink-soft">
                    {p.since && <p>{t("on irlpass since")} {new Date(p.since).toLocaleDateString(undefined, { month: "long", year: "numeric" }).toLowerCase()}</p>}
                    {p.ig && <p className="mt-1 font-semibold text-ink">{p.ig}</p>}
                  </section>
                )}
              </div>
            </div>

            {!p.self && p.blocked && (
              <div className="border-t border-line/70 bg-cream/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                {t("women only")}
              </div>
            )}
            {!p.self && !p.blocked && (
              <div className="border-t border-line/70 bg-cream/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                {p.canMessage ? (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => onMessage?.(p)} className="w-full rounded-full bg-ink py-4 text-[15px] font-bold text-cream shadow-[0_12px_28px_-12px_rgba(58,50,44,0.7)]">
                    {p.talked ? t("open chat") : `${t("make a plan with")} ${p.first}`}
                  </motion.button>
                ) : (
                  // open the chat and write; the paywall shows when they hit send
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => onMessage?.(p)} className="w-full rounded-full bg-ink py-4 text-[15px] font-bold text-cream shadow-[0_12px_28px_-12px_rgba(58,50,44,0.7)]">
                    {t("make a plan with")} {p.first}
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
