import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, MagnifyingGlass, X } from "@phosphor-icons/react"
import { t, LANG } from "../lib/i18n"
import { cityChip } from "../lib/cities"
import Poster from "./Poster"
import { haptic } from "../lib/haptic"

// "make a plan with maría", tinder simple: one place at a time. ✕ skips,
// ✓ sends her "want to go here?" as a dm. the dm is the paywall moment: a
// free member writes it, and pays to deliver it (it sends itself after).
export default function PlanDeck({ token, me, person, city, onClose, onSent, onPaywall }) {
  const [places, setPlaces] = useState(null)
  const [i, setI] = useState(0)
  const [night, setNight] = useState("tonight")
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState("")
  const [looking, setLooking] = useState(false)
  const place = String(cityChip(city).name || city).toLowerCase()

  useEffect(() => {
    fetch(`/api/city-guide?t=${token}&city=${city}&lang=${LANG}`).then((r) => r.json()).then((d) => setPlaces(d.places || [])).catch(() => setPlaces([]))
  }, [token, city])

  // have somewhere in mind? search it, the results become the deck
  const search = async (e) => {
    e?.preventDefault()
    if (q.trim().length < 2 || looking) return
    setLooking(true)
    const d = await fetch("/api/event-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, city, q: q.trim(), lang: LANG }),
    }).then((r) => r.json()).catch(() => null)
    setLooking(false)
    if (d?.places?.length) { setPlaces(d.places); setI(0) }
  }

  const cur = places?.[i]
  const skip = () => { haptic(); setI((x) => x + 1) }
  const pick = async () => {
    if (!cur || busy) return
    haptic("pop")
    setBusy(true)
    const text = `want to go to ${cur.name} ${night}?${cur.maps ? ` ${cur.maps}` : ""}`
    const r = await fetch("/api/dm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, to: person.memberNo, text }),
    }).then((x) => x.json()).catch(() => null)
    setBusy(false)
    if (r?.ok) return onSent?.()
    if (r?.gate === "deliver") {
      try { localStorage.setItem("irl:pending-dm", JSON.stringify({ to: person.memberNo, text, name: person.first, photo: person.photo })) } catch { /* private mode */ }
      return onPaywall?.({ reason: "deliver", next: `deliver-${person.memberNo}`, draft: text })
    }
    if (r?.gate) return onPaywall?.(r.gate)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[75] flex flex-col bg-cream px-4 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        <div className="flex items-center gap-3">
          {person.photo && <img src={person.photo} alt="" className="h-10 w-10 rounded-full object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-ink-soft">{t("where should you go with")}</p>
            <p className="serif-display text-[22px] leading-none">{person.first}</p>
          </div>
          <button onClick={onClose} aria-label={t("close")} className="grid h-10 w-10 place-items-center rounded-full border border-line"><X size={18} /></button>
        </div>

        <div className="mt-3 flex gap-1.5">
          {["tonight", "tomorrow", "this weekend"].map((n) => (
            <button key={n} onClick={() => setNight(n)} className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold ${night === n ? "border-lime bg-lime text-white" : "border-line"}`}>{t(n)}</button>
          ))}
        </div>

        <form onSubmit={search} className="mt-3 flex items-center gap-2 rounded-full border border-line px-4 py-2.5">
          <MagnifyingGlass size={16} className="text-ink-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("have a place in mind? search it")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          {looking && <span className="text-[12px] font-semibold text-ink-soft">{t("looking")}…</span>}
        </form>

        <div className="relative mt-4 flex-1">
          {places === null && <div className="absolute inset-0 animate-pulse rounded-[2rem] bg-ink/5" />}
          {places && !cur && (
            <div className="absolute inset-0 grid place-items-center rounded-[2rem] border border-dashed border-line p-8 text-center">
              <div>
                <p className="serif-display text-[24px]">{t("that's every spot")}</p>
                <button onClick={() => setI(0)} className="mt-3 rounded-full border border-line px-4 py-2 text-[13px] font-bold">{t("start over")}</button>
              </div>
            </div>
          )}
          <AnimatePresence>
            {cur && (
              <motion.div
                key={i}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.9}
                onDragEnd={(_, info) => { if (info.offset.x > 110) pick(); else if (info.offset.x < -110) skip() }}
                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ x: -360, opacity: 0, rotate: -10, transition: { duration: 0.25 } }}
                whileDrag={{ rotate: 4 }}
                className="absolute inset-0 cursor-grab overflow-hidden rounded-[2rem] bg-ink shadow-[0_24px_50px_-20px_rgba(0,0,0,0.7)] active:cursor-grabbing"
              >
                {cur.photo
                  ? <img src={cur.photo} alt="" draggable={false} className="h-full w-full object-cover" />
                  : <Poster title={cur.name} top={cur.kind} bottom={cur.area || place} seed={cur.name} />}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 pt-20 text-white">
                  {cur.michelin && <span className="mb-2 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur">{cur.michelin === "star" ? "michelin star" : cur.michelin === "bib" ? "bib gourmand" : "michelin guide"}</span>}
                  <p className="serif-display text-[30px] leading-[0.95]">{String(cur.name).toLowerCase()}</p>
                  <p className="mt-1 text-[13px] text-white/75">{[cur.kind, cur.area, cur.price].filter(Boolean).join(" · ")}</p>
                  {cur.why && <p className="mt-2 line-clamp-2 text-[13.5px] leading-snug text-white/85">{cur.why}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center justify-center gap-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={skip} disabled={!cur} aria-label={t("skip")} className="grid h-16 w-16 place-items-center rounded-full border border-line bg-white/5 disabled:opacity-40"><X size={26} weight="bold" /></motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={pick} disabled={!cur || busy} aria-label={t("ask them")} className="grid h-20 w-20 place-items-center rounded-full bg-lime text-white shadow-[0_14px_30px_-10px_rgba(74,102,255,0.8)] disabled:opacity-50"><Check size={32} weight="bold" /></motion.button>
        </div>
        <p className="mt-2 text-center text-[12px] text-ink-soft">{t("swipe right to ask")} {person.first}</p>
      </div>
    </motion.div>
  )
}
