import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// "my day": the lagos page, for everyone. a timeline of the day (time, emoji,
// place, one line, a map link), "pick one" choices on some stops, and a link
// to send it to whoever you're with.
const VIBES = [
  ["eat well", "🍽️"], ["coffee", "☕"], ["outdoors", "🌿"], ["culture", "🖼️"],
  ["shopping", "🛍️"], ["nightlife", "🪩"], ["with my partner", "💞"], ["slow day", "🫖"],
]

// the timeline itself: used in the sheet and on the shared page
export function DayTimeline({ plan, picks, onPick }) {
  return (
    <div>
      <h2 className="display text-[28px] font-bold leading-[1.02] tracking-tight">{plan.title}</h2>
      {plan.intro && <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">{plan.intro}</p>}
      <ol className="relative mt-5 space-y-3 before:absolute before:bottom-3 before:left-[77px] before:top-3 before:w-px before:bg-line">
        {plan.stops.map((s, i) => {
          const chosen = picks?.[i] ?? -1 // -1 = the main pick, else an alternative
          const cur = chosen >= 0 && s.alts?.[chosen] ? s.alts[chosen] : s
          return (
            <motion.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="relative flex gap-3">
              <div className="w-[52px] shrink-0 pt-3 text-right text-[12px] font-bold tabular-nums text-ink-soft">{s.time}</div>
              <div className="relative z-10 mt-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[15px] shadow-[0_1px_3px_rgba(58,50,44,0.15)]">{cur.emoji}</div>
              <div className="min-w-0 flex-1 rounded-[1.2rem] bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(58,50,44,0.05)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-tight">{cur.name}</p>
                    {cur.area && <p className="text-[12px] text-ink-soft">{cur.area}</p>}
                  </div>
                  <a href={cur.mapUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-cream-deep/70 px-2.5 py-1 text-[11.5px] font-bold">{t("map")} ↗</a>
                </div>
                {cur.line && <p className="mt-1 text-[13.5px] leading-snug">{cur.line}</p>}
                {s.tip && chosen < 0 && <p className="mt-1 text-[12.5px] text-ink-soft">💡 {s.tip}</p>}
                {s.alts?.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-ink-soft">{t("pick one")}:</span>
                    {[s, ...s.alts].map((a, k) => {
                      const on = (k === 0 && chosen < 0) || k - 1 === chosen
                      return (
                        <button
                          key={k}
                          onClick={() => onPick?.(i, k === 0 ? -1 : k - 1)}
                          className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${on ? "bg-ink text-cream" : "bg-cream-deep/70"}`}
                        >
                          {a.emoji} {a.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}

// a nice line per stop, for sending the plan to someone
export const planText = (plan, picks) =>
  plan.stops.map((s, i) => {
    const cur = picks?.[i] >= 0 && s.alts?.[picks[i]] ? s.alts[picks[i]] : s
    return `${s.time} ${cur.emoji} ${cur.name}`
  }).join("\n")

function Working({ city }) {
  const [ms, setMs] = useState(0)
  useEffect(() => { const id = setInterval(() => setMs((x) => x + 500), 500); return () => clearInterval(id) }, [])
  const steps = [t("checking what's open today"), t("looking up holidays and closures"), `${t("asking around")} ${city || t("your city")}`, t("keeping it walkable"), t("writing your day")]
  const step = Math.min(steps.length - 1, Math.floor(ms / 5000))
  const pct = Math.min(94, 100 * (1 - Math.exp(-ms / 16000)))
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }} className="text-[40px]">🗺️</motion.div>
      <AnimatePresence mode="wait">
        <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-[14px] font-bold">{steps[step]}…</motion.p>
      </AnimatePresence>
      <div className="h-1.5 w-[220px] overflow-hidden rounded-full bg-cream-deep">
        <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} className="h-full rounded-full bg-ink" />
      </div>
      {ms > 30000 && <p className="text-[12px] text-ink-soft">{t("planning a whole day takes a minute. worth it.")}</p>}
    </div>
  )
}

export function DaySheet({ token, me, cityName, trips = [], onPaywall, onClose }) {
  const [wish, setWish] = useState("")
  const [vibes, setVibes] = useState([])
  const [when, setWhen] = useState("today") // today | tomorrow | trip city slug
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState(null)
  const [picks, setPicks] = useState({})
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)

  const go = async () => {
    setBusy(true); setErr("")
    const now = new Date()
    let here = null
    try { here = JSON.parse(sessionStorage.getItem("irl:here") || "null") } catch { /* private mode */ }
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const tomorrow = iso(new Date(now.getTime() + 864e5))
    const trip = trips.find((x) => x.city === when)
    const body = {
      t: token, wish, vibes, today: iso(now),
      day: now.getDay(), minute: now.getHours() * 60 + now.getMinutes(),
      ...(when === "tomorrow" ? { date: tomorrow } : {}),
      ...(trip ? { city: trip.city, date: trip.starts > iso(now) ? trip.starts : undefined } : {}),
      ...(here && !trip ? { lat: here.lat, lng: here.lng } : {}),
    }
    const r = await fetch("/api/day", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, d: await x.json().catch(() => ({})) })).catch(() => ({ status: 0, d: {} }))
    setBusy(false)
    if (r.status === 402) { onPaywall?.({ reason: "day" }); return }
    if (!r.d?.stops) { setErr(r.d?.error || t("couldn't plan that right now. try again in a bit")); return }
    setPlan(r.d); setPicks({})
  }

  const link = plan ? `https://irlpass.xyz/d/${plan.id}` : ""
  const share = async () => {
    const text = `${plan.title}\n${planText(plan, picks)}\n`
    try {
      if (navigator.share) await navigator.share({ title: plan.title, text, url: link })
      else { await navigator.clipboard.writeText(`${text}${link}`); setCopied(true) }
    } catch { /* dismissed */ }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="fixed inset-x-0 bottom-0 top-10 z-50 mx-auto flex max-w-[460px] flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <p className="text-[12px] font-semibold text-ink-soft">{t("my day")}{plan?.cityName || cityName ? ` · ${(plan?.cityName || cityName).toLowerCase()}` : ""}</p>
          <button onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><X size={18} weight="bold" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">
          {busy ? <Working city={cityName?.toLowerCase()} /> : plan ? (
            <DayTimeline plan={plan} picks={picks} onPick={(i, k) => setPicks((p) => ({ ...p, [i]: k }))} />
          ) : (
            <>
              <h2 className="display text-[28px] font-bold leading-[1.02] tracking-tight">{t("plan my day")}</h2>
              <p className="mt-1 text-[13.5px] text-ink-soft">{t("tell it what you're in the mood for. it knows where you are, what's open and what's on.")}</p>
              <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
                {[["today", t("today")], ["tomorrow", t("tomorrow")], ...trips.filter((x) => x.starts > new Date().toISOString().slice(0, 10)).slice(0, 3).map((x) => [x.city, `✈️ ${x.name.toLowerCase()}`])].map(([k, l]) => (
                  <button key={k} onClick={() => setWhen(k)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${when === k ? "bg-ink text-cream" : "bg-white shadow-sm"}`}>{l}</button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {VIBES.map(([v, e]) => {
                  const on = vibes.includes(v)
                  return (
                    <button key={v} onClick={() => setVibes((x) => (on ? x.filter((y) => y !== v) : [...x, v]))} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${on ? "bg-ink text-cream" : "bg-white shadow-sm"}`}>
                      {e} {t(v)}
                    </button>
                  )
                })}
              </div>
              <textarea
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                rows={3}
                name="day-wish"
                autoComplete="off"
                placeholder={t("anything specific? like: lunch first, then a rooftop, sneakers somewhere")}
                className="mt-3 w-full resize-none rounded-[1.2rem] bg-white px-4 py-3 text-[14.5px] shadow-sm outline-none placeholder:text-ink-soft/50"
              />
              {err && <p className="mt-2 text-[12.5px] font-semibold text-[#b3461f]">{err}</p>}
            </>
          )}
        </div>
        <div className="border-t border-line/70 bg-cream/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {plan ? (
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.97 }} onClick={share} className="flex-1 rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream">
                {copied ? t("link copied") : t("send my day")}
              </motion.button>
              <button onClick={() => { setPlan(null); setPicks({}) }} className="rounded-full bg-white px-5 text-[13.5px] font-bold shadow-sm">{t("redo")}</button>
            </div>
          ) : (
            <motion.button whileTap={{ scale: 0.97 }} onClick={go} disabled={busy} className="w-full rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream disabled:opacity-60">
              {t("plan it")}
            </motion.button>
          )}
        </div>
      </motion.div>
    </>
  )
}

// the page a shared link opens (no account needed): see the plan, pick your
// options, send your picks back, or plan your own
export function SharedDay({ id }) {
  const [plan, setPlan] = useState(null)
  const [picks, setPicks] = useState({})
  const [err, setErr] = useState("")
  useEffect(() => {
    fetch(`/api/day?id=${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => (d.stops ? setPlan(d) : setErr(d.error || "not found"))).catch(() => setErr("couldn't open that plan"))
  }, [id])
  const sendBack = async () => {
    const text = `my picks for ${plan.title}:\n${planText(plan, picks)}`
    try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text) } catch { /* dismissed */ }
  }
  return (
    <div className="min-h-[100dvh] px-5 pb-16 pt-8">
      <p className="text-[12px] font-semibold text-ink-soft">irlpass · {t("a day in")} {(plan?.cityName || "").toLowerCase()}</p>
      {err && <p className="mt-10 text-center text-[14px] text-ink-soft">{err}</p>}
      {plan && (
        <>
          <div className="mt-2"><DayTimeline plan={plan} picks={picks} onPick={(i, k) => setPicks((p) => ({ ...p, [i]: k }))} /></div>
          {plan.stops.some((s) => s.alts?.length) && (
            <button onClick={sendBack} className="mt-6 w-full rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream">{t("send back my picks")}</button>
          )}
          <a href="/?screen=join" className="mt-3 block w-full rounded-full bg-white py-3.5 text-center text-[14.5px] font-bold shadow-sm">{t("plan your own day on irlpass")}</a>
        </>
      )}
    </div>
  )
}
