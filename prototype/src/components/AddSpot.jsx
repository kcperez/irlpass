import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Camera, CheckCircle, CircleNotch, MagnifyingGlass, MapPin, Star, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// "know a spot? add it" (josh v5): crowdsourced, so nobody seeds every city by
// hand. google maps first: one tap pulls in the name, address, hours, photos,
// price and directions. too new for google? drop a pin and add it yourself.
// either way it goes live once a mod approves it.
export const MOOD_CHIPS = [
  { key: "lockin", emoji: "🧘", label: "lock in" },
  { key: "explore", emoji: "🗺️", label: "explore" },
  { key: "pregame", emoji: "🍸", label: "pregame" },
  { key: "afters", emoji: "🪩", label: "afters" },
  { key: "chill", emoji: "☕", label: "chill" },
]
const PRICES = ["$", "$$", "$$$", "$$$$"]

const Sheet = ({ children, onClose }) => (
  <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
    <motion.div
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
      className="fixed inset-x-0 bottom-0 top-8 z-50 mx-auto flex max-w-[460px] flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
    >
      <div className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-line" />
      {children}
    </motion.div>
  </>
)

function Chips({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MOOD_CHIPS.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold ${value === m.key ? "border-ink bg-ink text-cream" : "border-line bg-white/70"}`}
        >
          <span>{m.emoji}</span>{t(m.label)}
        </button>
      ))}
    </div>
  )
}

// shrink a phone photo before it goes up
const shrink = (file) => new Promise((ok) => {
  const img = new Image()
  img.onload = () => {
    const k = Math.min(1, 1400 / Math.max(img.width, img.height))
    const c = document.createElement("canvas")
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
    ok(c.toDataURL("image/jpeg", 0.8))
  }
  img.onerror = () => ok(null)
  img.src = URL.createObjectURL(file)
})

function PinMap({ center, onMove }) {
  const el = useRef(null)
  useEffect(() => {
    let map
    let dead = false
    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([{ default: maplibregl }]) => {
      if (dead || !el.current) return
      map = new maplibregl.Map({
        container: el.current,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [center?.lng ?? -75.57, center?.lat ?? 6.21],
        zoom: 13.5,
        attributionControl: { compact: true },
        dragRotate: false,
      })
      const send = () => { const c = map.getCenter(); onMove({ lat: c.lat, lng: c.lng }) }
      map.on("moveend", send)
      map.on("load", send)
      // start on where they are, when they let us
      navigator.geolocation?.getCurrentPosition((p) => map.jumpTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 16 }), () => {}, { timeout: 6000, maximumAge: 300000 })
    })
    return () => { dead = true; map?.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative h-[220px] overflow-hidden rounded-[1.4rem] border border-line">
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {/* the pin stays in the middle; you move the map under it */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <MapPin size={38} weight="fill" className="text-ink drop-shadow-[0_4px_6px_rgba(0,0,0,0.3)]" />
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-ink/80 px-3 py-1 text-[11px] font-bold text-cream">{t("move the map to put the pin on it")}</p>
    </div>
  )
}

export default function AddSpot({ token, city, cityName, center, mood: startMood, onClose, onAdded, onOpenSpot }) {
  const [step, setStep] = useState("search") // search | pick | pin | done
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [results, setResults] = useState(null)
  const [picked, setPicked] = useState(null)
  const [mood, setMood] = useState(startMood && startMood !== "all" ? startMood : "chill")
  const [note, setNote] = useState("")
  const [price, setPrice] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [pin, setPin] = useState(null)
  const [name, setName] = useState("")
  const [done, setDone] = useState(null)
  const name0 = String(cityName || "").toLowerCase()

  const search = async () => {
    if (q.trim().length < 2 || busy) return
    setBusy(true); setErr(""); setResults(null)
    const d = await fetch(`/api/mood?t=${token}&city=${city}&google=${encodeURIComponent(q.trim())}`).then((r) => r.json()).catch(() => null)
    setBusy(false)
    if (!d?.places) return setErr(d?.error || t("couldn't reach google maps. try again"))
    if (!d.places.length && d.error) return setErr(d.error)
    setResults(d.places)
  }

  const submit = async (place) => {
    setBusy(true); setErr("")
    const d = await fetch("/api/mood", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, city, action: "suggest", place, mood, note, priceLevel: price ? price.length : null, photo }),
    }).then((r) => r.json()).catch(() => null)
    setBusy(false)
    if (!d?.ok) return setErr(d?.error || t("that didn't go through. try again"))
    setDone(d)
    setStep("done")
    onAdded?.()
  }

  const back = () => { setErr(""); setStep(step === "pick" || step === "pin" ? "search" : "search") }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between px-5 pb-2 pt-3">
        <div className="flex items-center gap-2">
          {(step === "pick" || step === "pin") && (
            <button onClick={back} aria-label={t("back")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><ArrowLeft size={17} weight="bold" /></button>
          )}
          <div>
            <p className="text-[12px] font-semibold text-ink-soft">{t("add a spot")} · {name0}</p>
            <h2 className="display text-[24px] font-bold leading-tight">
              {step === "pin" ? t("drop a pin") : step === "done" ? t("thank you") : t("know a spot?")}
            </h2>
          </div>
        </div>
        <button onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><X size={18} weight="bold" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
        <AnimatePresence mode="wait">
          {step === "search" && (
            <motion.div key="s" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <form onSubmit={(e) => { e.preventDefault(); search() }} className="flex gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlass size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    enterKeyHint="search"
                    autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other"
                    placeholder={t("search google maps")}
                    className="w-full rounded-full border border-line bg-white py-3 pl-10 pr-4 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50 focus:border-ink"
                  />
                </div>
                <button disabled={busy || q.trim().length < 2} className="shrink-0 rounded-full bg-ink px-5 text-[14px] font-bold text-cream disabled:opacity-40">
                  {busy ? <CircleNotch size={16} className="animate-spin" /> : t("find")}
                </button>
              </form>
              {busy && <p className="mt-4 text-center text-[13px] font-semibold text-ink-soft">{t("checking google maps in")} {name0}…</p>}
              {err && <p className="mt-3 text-center text-[13px] font-semibold text-[#b3461f]">{err}</p>}
              {results?.length === 0 && <p className="mt-4 text-center text-[13px] text-ink-soft">{t("nothing on google by that name here.")}</p>}
              <div className="mt-3 space-y-2">
                {(results || []).map((p) => (
                  <motion.button
                    key={p.osmId}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setPicked(p); setPrice(p.priceLevel ? "$".repeat(p.priceLevel) : null); setStep("pick") }}
                    className="flex w-full items-center gap-3 rounded-[1.3rem] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_20px_-12px_rgba(58,50,44,0.3)]"
                  >
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[0.9rem] bg-cream-deep">
                      {p.photo && <img src={p.photo} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold leading-tight">{p.name}</span>
                      <span className="block truncate text-[12px] text-ink-soft">{[p.kind, String(p.area || "").toLowerCase()].filter(Boolean).join(" · ")}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
                        {p.rating ? <><Star size={11} weight="fill" className="text-ink" />{Number(p.rating).toFixed(1)}</> : null}
                        {p.price ? <span>· {p.price}</span> : null}
                      </span>
                    </span>
                  </motion.button>
                ))}
              </div>
              <button onClick={() => setStep("pin")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-ink/30 py-3.5 text-[13.5px] font-bold text-ink-soft">
                <MapPin size={16} weight="fill" /> {t("too new for google? drop a pin")}
              </button>
            </motion.div>
          )}

          {step === "pick" && picked && (
            <motion.div key="p" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <div className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.06),0_10px_26px_-16px_rgba(58,50,44,0.4)]">
                {picked.photo && <img src={picked.photo} alt="" className="aspect-[16/9] w-full object-cover" />}
                <div className="p-4">
                  <p className="text-[12px] font-semibold text-ink-soft">{[picked.kind, String(picked.area || "").toLowerCase()].filter(Boolean).join(" · ")}</p>
                  <p className="display text-[24px] font-bold leading-tight">{picked.name}</p>
                  {picked.address && <p className="mt-1 text-[12.5px] text-ink-soft">{picked.address}</p>}
                  <p className="mt-2 text-[12px] font-semibold text-ink-soft">{t("hours, photos and price come straight from google")}</p>
                </div>
              </div>
              <p className="mb-2 mt-5 text-[12px] font-bold text-ink-soft">{t("which mood is it?")}</p>
              <Chips value={mood} onChange={setMood} />
              <p className="mb-2 mt-5 text-[12px] font-bold text-ink-soft">{t("why go? one line (optional)")}</p>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={t("best cold brew in town, sunset from the roof…")} className="w-full rounded-full border border-line bg-white px-4 py-3 text-[14px] font-semibold outline-none focus:border-ink" />
              {err && <p className="mt-3 text-center text-[13px] font-semibold text-[#b3461f]">{err}</p>}
              <button onClick={() => submit(picked)} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[15.5px] font-bold text-cream disabled:opacity-50">
                {busy ? <CircleNotch size={17} className="animate-spin" /> : t("add it to the guide")}
              </button>
            </motion.div>
          )}

          {step === "pin" && (
            <motion.div key="n" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <PinMap center={center} onMove={setPin} />
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t("what's it called?")} className="mt-3 w-full rounded-full border border-line bg-white px-4 py-3 text-[15px] font-bold outline-none focus:border-ink" />
              <p className="mb-2 mt-4 text-[12px] font-bold text-ink-soft">{t("mood")}</p>
              <Chips value={mood} onChange={setMood} />
              <p className="mb-2 mt-4 text-[12px] font-bold text-ink-soft">{t("price")}</p>
              <div className="flex gap-1.5">
                {PRICES.map((p) => (
                  <button key={p} onClick={() => setPrice(price === p ? null : p)} className={`flex-1 rounded-full border py-2 text-[13px] font-bold ${price === p ? "border-ink bg-ink text-cream" : "border-line bg-white/70"}`}>{p}</button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <label className="flex h-[52px] w-[52px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[1rem] border border-line bg-white">
                  {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Camera size={20} className="text-ink-soft" />}
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await shrink(f)) }} />
                </label>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={t("one line on why you go")} className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[14px] font-semibold outline-none focus:border-ink" />
              </div>
              {err && <p className="mt-3 text-center text-[13px] font-semibold text-[#b3461f]">{err}</p>}
              <button
                onClick={() => submit({ name: name.trim(), lat: pin?.lat, lng: pin?.lng, google: false })}
                disabled={busy || name.trim().length < 2 || !pin}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[15.5px] font-bold text-cream disabled:opacity-40"
              >
                {busy ? <CircleNotch size={17} className="animate-spin" /> : t("add it to the guide")}
              </button>
              <p className="mt-2 text-center text-[11.5px] text-ink-soft">{t("directions open in google maps from the pin")}</p>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div key="d" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center pt-10 text-center">
              <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 16 }} className="flex h-16 w-16 items-center justify-center rounded-full bg-lime">
                <CheckCircle size={34} weight="fill" />
              </motion.span>
              <p className="display mt-4 text-[26px] font-bold leading-tight">
                {done?.exists ? t("it's already on the guide") : done?.pending ? t("sent for a quick check") : t("it's live")}
              </p>
              <p className="mt-1.5 max-w-[300px] text-[14px] text-ink-soft">
                {done?.exists
                  ? t("someone beat you to it. say you're going and bring people.")
                  : done?.pending
                    ? t("it goes live for everyone once we've had a look. you'll see it on your guide with a new label in the meantime.")
                    : t("everyone in the city can see it now.")}
              </p>
              <div className="mt-6 flex w-full gap-2">
                {done?.spotId && <button onClick={() => onOpenSpot?.(done.spotId)} className="flex-1 rounded-full bg-ink py-3.5 text-[14px] font-bold text-cream">{t("see it")}</button>}
                <button onClick={() => { setStep("search"); setQ(""); setResults(null); setPicked(null); setNote(""); setPhoto(null); setName(""); setDone(null) }} className="flex-1 rounded-full border border-line bg-white py-3.5 text-[14px] font-bold">{t("add another")}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  )
}
