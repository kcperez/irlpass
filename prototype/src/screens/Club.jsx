import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  CalendarPlus,
  UsersThree,
  ChatsCircle,
  ArrowLeft,
  PaperPlaneRight,
  Plus,
  MapPin,
  MapTrifold,
  ListBullets,
  Sparkle,
  CircleNotch,
  X,
  PushPin,
} from "@phosphor-icons/react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import QRCode from "qrcode"
import { Logo, ColombiaFlag } from "../components/bits"
import { t, LANG } from "../lib/i18n"

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
const MDE_CENTER = [-75.578, 6.235]

const NEIGHBORHOODS = [
  { name: "el poblado", lat: 6.2088, lng: -75.5679 },
  { name: "laureles", lat: 6.2459, lng: -75.5916 },
  { name: "envigado", lat: 6.1696, lng: -75.5856 },
  { name: "centro", lat: 6.2518, lng: -75.5636 },
  { name: "sabaneta", lat: 6.1516, lng: -75.6167 },
  { name: "guatapé (day trip)", lat: 6.2342, lng: -75.1592 },
]

// curated by the founders, clearly badged — tap one to turn it into a real plan
const SUGGESTIONS = [
  { title: "sunset at pueblito paisa", place: NEIGHBORHOODS[0], lat: 6.2353, lng: -75.5801 },
  { title: "coffee crawl in laureles", place: NEIGHBORHOODS[1], lat: 6.2459, lng: -75.5916 },
  { title: "guatapé + la piedra day trip", place: NEIGHBORHOODS[5], lat: 6.2342, lng: -75.1592 },
  { title: "comuna 13 graffiti tour", place: NEIGHBORHOODS[3], lat: 6.2496, lng: -75.619 },
]

const emojiFor = (title = "") => {
  const t = title.toLowerCase()
  if (/dinner|food|eat|lunch|brunch|asado/.test(t)) return "🍽️"
  if (/coffee|café|cafe/.test(t)) return "☕"
  if (/padel|tennis|gym|run|futbol|fútbol|soccer/.test(t)) return "🎾"
  if (/hike|cerro|walk|trek/.test(t)) return "🥾"
  if (/party|club|night|salsa|bar/.test(t)) return "🎉"
  if (/guatapé|guatape|trip|tour/.test(t)) return "🚌"
  if (/sunset|view/.test(t)) return "🌇"
  return "📍"
}

const bogotaTodayISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)
const nextDays = (n = 7) => {
  const out = []
  const base = Date.now() - 5 * 3600e3
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86400e3)
    const iso = d.toISOString().slice(0, 10)
    const loc = LANG === "es" ? "es-ES" : "en-US"
    const label = i === 0 ? t("today") : i === 1 ? t("tomorrow") : d.toLocaleDateString(loc, { weekday: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()
    out.push({ iso, label })
  }
  return out
}
const isPastDate = (iso) => iso && iso < bogotaTodayISO()
// drop relative day words people type ("tonight at 7pm" -> "7pm") so they can't go stale
const timeOnly = (when = "") => when.replace(/\b(tonight|today|tomorrow|tmrw|this (morning|afternoon|evening|weekend)|sat|sun|mon|tue|wed|thu|fri)\b/gi, "").replace(/^[\s·,-]+|[\s·,-]+$/g, "").trim()
// authoritative temporal line from the real date + cleaned time
const whenLine = (a) => {
  const past = isPastDate(a.date)
  const tt = timeOnly(a.when)
  return `${past ? t("was") + " " : ""}${dayLabel(a.date)}${tt ? ` · ${tt}` : ""}`
}
const dayLabel = (iso) => {
  if (!iso) return ""
  const days = nextDays(7)
  const hit = days.find((d) => d.iso === iso)
  if (hit) return hit.label
  const loc = LANG === "es" ? "es-ES" : "en-US"
  if (iso < days[0].iso) return new Date(iso + "T12:00:00Z").toLocaleDateString(loc, { month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()
  return new Date(iso + "T12:00:00Z").toLocaleDateString(loc, { weekday: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()
}

const EMOJI_CHOICES = ["🍽️", "☕", "🎾", "🥾", "🎉", "🚌", "🌇", "🏖️", "🎬", "🛍️", "⚽", "📍"]
const actEmojiOf = (a) => a.emoji || emojiFor(a.title)

// the round activity icon: an uploaded photo if there is one, else the emoji
function ActIcon({ a, size = "h-10 w-10 text-[16px]" }) {
  if (a.image) return <img src={a.image} alt="" className={`${size.split(" ").slice(0, 2).join(" ")} shrink-0 rounded-full object-cover`} />
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-cream-deep`}>{actEmojiOf(a)}</span>
}

const AVATAR_EMOJI = ["🌴", "🏔️", "☕", "🛵", "🪂", "🌞", "🥟", "💃", "🎒", "🛬", "🍹", "⚽"]
const avatarFor = (m) => AVATAR_EMOJI[parseInt(m.memberNo, 10) % AVATAR_EMOJI.length]

function Avatar({ member, size = "h-9 w-9 text-[15px]", photo }) {
  const src = photo ?? member.photo
  if (src) {
    return <img src={src} alt={member.name} className={`${size.split(" ").slice(0, 2).join(" ")} shrink-0 rounded-full object-cover`} />
  }
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-lime/60 font-semibold text-ink`}>
      {avatarFor(member)}
    </span>
  )
}

// downscale a chosen photo to a small square jpeg before upload
const resizeImage = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 512
      const ctx = canvas.getContext("2d")
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 512, 512)
      resolve(canvas.toDataURL("image/jpeg", 0.82))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })

function ProfileSheet({ token, me, onPhoto, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [qr, setQr] = useState(null)
  const [past, setPast] = useState([])

  useEffect(() => {
    fetch(`/api/activities?t=${token}&scope=past`)
      .then((r) => r.json())
      .then((d) => setPast(d.activities || []))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    QRCode.toDataURL(`https://irlpass.xyz/?screen=app&t=${token}`, {
      margin: 1,
      width: 480,
      color: { dark: "#1c1b17", light: "#f4f1ea" },
    })
      .then(setQr)
      .catch(() => {})
  }, [token])

  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const image = await resizeImage(file)
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, image }),
      })
      const d = await r.json()
      if (!d.photo) throw new Error()
      onPhoto(d.photo)
    } catch {
      setError(t("upload didn't take. try again"))
    }
    setBusy(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-end bg-ink/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        exit={{ y: 120 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl bg-cream px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line" />
        <div className="mt-5 flex items-center gap-4">
          <Avatar member={me} photo={me.photo} size="h-16 w-16 text-[26px]" />
          <div>
            <p className="display text-[20px] font-bold leading-tight">{me.name.toLowerCase()}</p>
            <p className="font-mono text-[11px] text-ink-soft">{me.ig} · nº {me.memberNo}</p>
          </div>
        </div>
        <label className={`mt-5 flex w-full cursor-pointer items-center justify-center rounded-full bg-lime px-6 py-3.5 text-[14.5px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)] ${busy ? "opacity-60" : ""}`}>
          {busy ? t("uploading…") : me.photo ? t("change your photo") : t("add your photo")}
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
        </label>
        {error && <p className="mt-2.5 text-center text-[12.5px] font-medium text-[#b3461f]">{error}</p>}
        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft/70">
          {t("your face shows on the members list and in chats")}
        </p>

        {qr && (
          <div className="mt-5 flex items-center gap-4 rounded-2xl border border-line bg-white/70 p-4">
            <img src={qr} alt="log in on another device" className="h-24 w-24 rounded-lg" />
            <div>
              <p className="text-[13.5px] font-semibold leading-snug">{t("log in on your phone")}</p>
              <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-ink-soft">
                {t("scan with your camera. it opens the club, logged in as you.")}
              </p>
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div className="mt-4 rounded-2xl border border-line bg-white/70 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">your memories</p>
            <div className="mt-2 space-y-1.5">
              {past.slice(0, 5).map((a) => (
                <p key={a.id} className="text-[13px] text-ink">
                  {actEmojiOf(a)} {a.title} <span className="font-mono text-[10.5px] text-ink-soft">· {dayLabel(a.date)}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        <a
          href={`/?screen=pass&t=${token}&name=${encodeURIComponent(me.name)}&n=${me.memberNo}&ig=${encodeURIComponent(me.ig)}`}
          className="mt-4 flex w-full items-center justify-center rounded-full bg-ink py-3 text-[13.5px] font-semibold text-cream active:scale-[0.98]"
        >
          {t("view my pass")}
        </a>
        <div className="mt-2 flex gap-2">
          <button
            onClick={async () => {
              const r = await fetch("/api/portal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ t: token }),
              }).then((x) => x.json()).catch(() => null)
              if (r?.url) window.location.href = r.url
            }}
            className="w-full rounded-full border border-line py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft active:scale-[0.98]"
          >
            {t("manage subscription")}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("irlpass_member_token")
              window.location.href = "/"
            }}
            className="w-full rounded-full border border-line py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft active:scale-[0.98]"
          >
            {t("log out")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// typed location that resolves itself ("pueblito paisa" -> coordinates)
function PlaceInput({ value, onChange }) {
  const [q, setQ] = useState(value?.name || "")
  const [status, setStatus] = useState(value ? "found" : "idle") // idle | looking | found | missing
  const timer = useRef(null)

  const lookup = (text) => {
    clearTimeout(timer.current)
    const query = text.trim()
    if (query.length < 3) { onChange(null); setStatus("idle"); return }
    setStatus("looking")
    timer.current = setTimeout(async () => {
      try {
        const d = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`).then((r) => r.json())
        if (d.found) {
          onChange({ name: d.name, lat: d.lat, lng: d.lng })
          setStatus("found")
        } else {
          onChange({ name: query.toLowerCase(), lat: null, lng: null })
          setStatus("missing")
        }
      } catch {
        onChange({ name: query.toLowerCase(), lat: null, lng: null })
        setStatus("missing")
      }
    }, 600)
  }

  return (
    <div className="mt-3">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); lookup(e.target.value) }}
        placeholder={t("where? (pueblito paisa, alambique, parque lleras…)")}
        className="w-full border-b-2 border-line bg-transparent pb-1.5 text-[14px] outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
      />
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        {status === "looking" ? t("finding it…") : status === "found" ? `📍 ${value?.name} · on the map` : status === "missing" ? t("can't place it on the map, posting anyway") : t("type the spot, we'll find it")}
      </p>
    </div>
  )
}

// little lime confetti pop for join moments
function MiniBurst() {
  const shards = [
    { x: -42, y: -38, r: 120 }, { x: 44, y: -34, r: -150 }, { x: -30, y: 30, r: 80 },
    { x: 38, y: 26, r: -90 }, { x: 0, y: -50, r: 200 }, { x: -52, y: -6, r: -60 }, { x: 54, y: -4, r: 60 },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
      {shards.map((s, i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-2.5 rounded-[2px]"
          style={{ background: i % 3 === 0 ? "#1c1b17" : "var(--color-lime-deep)" }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
          animate={{ x: s.x, y: s.y, rotate: s.r, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  )
}

function TopBar({ me, onProfile }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-cream/95 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur md:pt-12">
      <Logo h="h-9" />
      <button
        onClick={onProfile}
        className="flex items-center gap-2 rounded-full border border-line bg-cream-deep/70 py-1 pl-1 pr-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft active:scale-95"
      >
        <Avatar member={me} photo={me.photo} size="h-6 w-6 text-[11px]" />
        nº {me.memberNo}
      </button>
    </header>
  )
}

/* ---------- map ---------- */
function MapView({ acts, me, onJoin, onPayJoin, onOpenChat, onPlanSuggestion, busy, photoMap = {} }) {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [selected, setSelected] = useState(null) // { type: "activity"|"suggestion", data }
  const [planWhen, setPlanWhen] = useState("")

  useEffect(() => {
    const map = new maplibregl.Map({
      container: wrapRef.current,
      style: MAP_STYLE,
      center: MDE_CENTER,
      zoom: 12,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const mk = (lng, lat, el, onClick) => {
      el.style.cursor = "pointer"
      el.addEventListener("click", (e) => { e.stopPropagation(); onClick() })
      const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
      markersRef.current.push(marker)
    }

    // real activities: lime pins. no location yet -> pinned near the city center, jittered
    acts.forEach((a, i) => {
      const lng = a.lng ?? MDE_CENTER[0] + (i % 5) * 0.004 - 0.008
      const lat = a.lat ?? MDE_CENTER[1] + ((i * 7) % 5) * 0.004 - 0.008
      const el = document.createElement("div")
      const icon = a.image
        ? `<img src="${a.image}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;border:1px solid #1c1b17"/>`
        : `<span style="font-size:14px">${actEmojiOf(a)}</span>`
      el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;background:#cdee45;border:2px solid #1c1b17;border-radius:999px;padding:3px 9px 3px 4px;box-shadow:0 4px 10px rgba(28,27,23,.25);font:600 12px Geist,sans-serif;color:#1c1b17">${icon} ${a.joined.length}${a.spots >= 999 ? "" : "/" + a.spots}</div>`
      mk(lng, lat, el, () => setSelected({ type: "activity", data: a }))
    })

    // founder suggestions: cream dashed pins. hidden once someone makes it a real plan
    SUGGESTIONS.filter((s) => !acts.some((a) => a.title === s.title)).forEach((s) => {
      const el = document.createElement("div")
      el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;background:#f4f1ea;border:2px dashed #b5da2e;border-radius:999px;padding:4px 9px;font:600 11px Geist,sans-serif;color:#57544a">✦ ${emojiFor(s.title)}</div>`
      mk(s.lng, s.lat, el, () => { setPlanWhen(""); setSelected({ type: "suggestion", data: s }) })
    })
  }, [acts])

  const [celebrate, setCelebrate] = useState(false)
  const a = selected?.data
  const joined = a && selected.type === "activity" && a.joined.some((j) => j.memberNo === me.memberNo)
  const open = a && a.spots >= 999
  const full = a && selected.type === "activity" && !open && a.joined.length >= a.spots

  return (
    <div className="relative h-full">
      <div ref={wrapRef} className="h-full w-full" />
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="absolute inset-x-3 bottom-3 rounded-2xl border border-line bg-cream p-4 shadow-[0_18px_40px_-18px_rgba(28,27,23,0.5)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {selected.type === "suggestion" && (
                  <p className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-lime-deep">
                    <Sparkle size={11} weight="fill" /> {t("founder suggestion")}
                  </p>
                )}
                <p className="text-[16px] font-semibold leading-snug">{actEmojiOf(a)} {a.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                  {selected.type === "activity" ? `${whenLine(a)}${a.place ? " · " + a.place : ""}` : a.place.name}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="font-mono text-[11px] text-ink-soft">{t("close")}</button>
            </div>

            {selected.type === "activity" && a.joined?.length > 0 && (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {a.joined.map((j) => (
                  <a
                    key={j.memberNo}
                    href={`https://instagram.com/${String(j.ig || "").replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 flex-col items-center gap-1"
                  >
                    <Avatar member={j} photo={photoMap[j.memberNo]} size="h-11 w-11 text-[17px]" />
                    <span className="max-w-[56px] truncate font-mono text-[9.5px] text-ink-soft">{j.name.toLowerCase().split(" ")[0]}</span>
                  </a>
                ))}
              </div>
            )}

            <div className="mt-3">
              {selected.type === "suggestion" ? (
                <div className="flex gap-2">
                  <select
                    value={planWhen}
                    onChange={(e) => setPlanWhen(e.target.value)}
                    className="w-full rounded-full border border-line bg-white/80 px-4 py-2.5 font-mono text-[12px] outline-none"
                  >
                    <option value="">{t("pick a day…")}</option>
                    {nextDays(7).map((d) => (
                      <option key={d.iso} value={d.iso}>{d.label}</option>
                    ))}
                  </select>
                  <button
                    disabled={!planWhen || busy}
                    onClick={async () => { await onPlanSuggestion(selected.data, planWhen); setSelected(null) }}
                    className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-cream active:scale-[0.98] disabled:opacity-40"
                  >
                    {busy ? "…" : t("make it a plan")}
                  </button>
                </div>
              ) : joined ? (
                <button
                  onClick={() => { onOpenChat(a.id, a.title, a); setSelected(null) }}
                  className="w-full rounded-full bg-ink py-3 text-[13.5px] font-semibold text-cream active:scale-[0.98]"
                >
                  {t("open chat")}
                </button>
              ) : (
                <div className="relative">
                  {celebrate && <MiniBurst />}
                  <button
                    disabled={full || busy}
                    onClick={async () => {
                      if (a.priceCents > 0) return onPayJoin(a)
                      const updated = await onJoin(a.id)
                      if (updated) {
                        setCelebrate(true)
                        setSelected({ type: "activity", data: updated })
                        setTimeout(() => setCelebrate(false), 900)
                      }
                    }}
                    className="w-full rounded-full bg-lime py-3 text-[13.5px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.15)] active:scale-[0.98] disabled:opacity-40"
                  >
                    {full ? t("full") : a.priceCents > 0 ? `${t("rsvp")} · $${(a.priceCents / 100).toFixed(0)}` : t("i'm in")}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- board ---------- */
function Board({ token, me, openChat, photoMap = {} }) {
  const [acts, setActs] = useState(null)
  const [view, setView] = useState("list")
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const [when, setWhen] = useState("")
  const [spots, setSpots] = useState(6)
  const [place, setPlace] = useState(null)
  const [date, setDate] = useState(bogotaTodayISO())
  const [actEmoji, setActEmoji] = useState(null) // null = auto from title
  const [details, setDetails] = useState("")
  const [photo, setPhoto] = useState(null) // dataURL preview of optional cover photo
  const [charge, setCharge] = useState(false) // host: charge per seat
  const [price, setPrice] = useState("15")
  const [busy, setBusy] = useState(false)

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (file) setPhoto(await resizeImage(file))
  }

  const load = useCallback(() => {
    fetch(`/api/activities?t=${token}`)
      .then((r) => r.json())
      .then((d) => setActs(d.activities || []))
      .catch(() => setActs([]))
  }, [token])
  useEffect(load, [load])

  const act = async (body) => {
    setBusy(true)
    const r = await fetch("/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, ...body }),
    })
      .then((r) => r.json())
      .catch(() => null)
    setBusy(false)
    load()
    return r?.activity || null
  }
  const [justJoined, setJustJoined] = useState(null)

  // paid activities: route join through stripe instead of a free rsvp
  const payJoin = async (a) => {
    const r = await fetch("/api/seat-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, id: a.id }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.url) window.location.href = r.url
  }

  const planSuggestion = async (s, dateIso) => {
    await act({
      action: "create",
      title: s.title,
      when: "flexible",
      date: dateIso,
      spots: 6,
      place: { name: s.place.name, lat: s.lat, lng: s.lng },
    })
  }

  if (view === "map" && acts) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="display text-[22px] font-bold">{t("the map")}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("list")}
              className="flex items-center gap-1.5 rounded-full border border-line bg-white/70 px-3.5 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] active:scale-95"
            >
              <ListBullets size={14} weight="bold" /> {t("list")}
            </button>
            <button
              onClick={() => { setCreating(true); setView("list") }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)] active:scale-95"
              aria-label="create activity"
            >
              <Plus size={18} weight="bold" />
            </button>
          </div>
        </div>
        {/* explicit height: percentage chains through flex break maplibre's canvas sizing */}
        <div className="relative h-[calc(var(--app-h)-186px)] md:h-[calc(var(--app-h)-218px)]">
          <MapView
            acts={acts}
            me={me}
            busy={busy}
            photoMap={photoMap}
            onJoin={async (id) => { await act({ action: "join", id }) }}
            onOpenChat={openChat}
            onPayJoin={payJoin}
            onPlanSuggestion={planSuggestion}
          />
          <div className="pointer-events-none absolute left-1/2 top-2.5 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-cream/95 px-3.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft shadow-sm">
            {t("tap a pin to join · ✦ = suggested")}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pb-28 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="display text-[26px] font-bold">{t("on the board")}</h2>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setView("map")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/70 text-ink"
            aria-label="map view"
          >
            <MapTrifold size={19} weight="duotone" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setCreating((c) => !c)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-lime text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)]"
            aria-label="create activity"
          >
            <Plus size={20} weight="bold" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl border border-line bg-white/70 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("i want to…")}</p>
              <div className="mt-1.5 flex items-center gap-2">
                {/* the circular icon: tap to upload a pic; the 🙂 swaps back to an emoji */}
                <div className="relative shrink-0">
                  <label className="flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-cream-deep text-[20px] active:scale-90">
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (actEmoji || emojiFor(title))}
                    <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                  </label>
                  <button
                    onClick={() => {
                      setPhoto(null)
                      const cur = actEmoji || emojiFor(title)
                      const i = EMOJI_CHOICES.indexOf(cur)
                      setActEmoji(EMOJI_CHOICES[(i + 1) % EMOJI_CHOICES.length])
                    }}
                    title="use an emoji instead"
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-cream text-[10px] active:scale-90"
                  >
                    🙂
                  </button>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("grab coffee in laureles")}
                  className="w-full border-b-2 border-line bg-transparent pb-1.5 text-[18px] font-medium outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
                />
              </div>
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {nextDays(7).map((d) => (
                  <button
                    key={d.iso}
                    onClick={() => setDate(d.iso)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10.5px] transition-colors ${date === d.iso ? "border-ink bg-lime text-ink font-semibold" : "border-line bg-white/60 text-ink-soft"}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  placeholder={t("time (8pm, after lunch, flexible…)")}
                  className="w-full border-b-2 border-line bg-transparent pb-1.5 text-[14px] outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
                />
                <select
                  value={spots}
                  onChange={(e) => setSpots(e.target.value)}
                  className="border-b-2 border-line bg-transparent pb-1.5 font-mono text-[13px] outline-none"
                >
                  {[4, 6, 8, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>{n} spots</option>
                  ))}
                  <option value={999}>open</option>
                </select>
              </div>
              <PlaceInput value={place} onChange={setPlace} />
              <input
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t("details (address, what to bring…) optional")}
                className="mt-3 w-full border-b-2 border-line bg-transparent pb-1.5 text-[13px] outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
              />
              {me.canHost && (
                <div className="mt-3 rounded-xl border border-line bg-cream-deep/40 p-3">
                  <label className="flex items-center justify-between">
                    <span className="text-[13px] font-medium">{t("charge per seat")}</span>
                    <button
                      onClick={() => setCharge((c) => !c)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${charge ? "bg-lime-deep" : "bg-line"}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${charge ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </label>
                  {charge && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="font-mono text-[18px] font-semibold">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-20 border-b-2 border-line bg-transparent pb-1 text-[18px] font-semibold outline-none focus:border-lime-deep"
                      />
                      <span className="font-mono text-[11px] text-ink-soft">{t("usd per person · they pay to rsvp")}</span>
                    </div>
                  )}
                </div>
              )}
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={!title.trim() || busy}
                onClick={async () => {
                  const created = await act({ action: "create", title, when: when.trim() || "flexible", date, spots, place, emoji: actEmoji || emojiFor(title), details, priceCents: charge ? Math.round(parseFloat(price || "0") * 100) : null })
                  if (created && photo) {
                    await fetch("/api/activity-photo", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ t: token, id: created.id, image: photo }),
                    }).catch(() => {})
                    load()
                  }
                  setTitle(""); setWhen(""); setDate(bogotaTodayISO()); setPlace(null); setActEmoji(null); setDetails(""); setPhoto(null); setCharge(false); setPrice("15"); setCreating(false)
                }}
                className="mt-4 w-full rounded-full bg-ink py-3 text-[14px] font-semibold text-cream disabled:opacity-35"
              >
                {busy ? t("posting…") : t("add to the board")}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!acts ? (
        <div className="mt-10 flex justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
      ) : acts.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="text-[15px] font-medium">{t("nothing on the board yet")}</p>
          <p className="mt-1 text-[13px] text-ink-soft">{t("post the first plan. someone's waiting for exactly it.")}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {acts.map((a) => {
            const joined = a.joined.some((j) => j.memberNo === me.memberNo)
            const open = a.spots >= 999
            const full = !open && a.joined.length >= a.spots
            return (
              <div key={a.id} className="rounded-2xl border border-line bg-white/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <ActIcon a={a} size="h-11 w-11 text-[18px]" />
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold leading-snug">{a.title}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                        {whenLine(a)}{a.place ? ` · ${a.place}` : ""} · by {a.creator.name.toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {a.priceCents > 0 && (
                      <span className="rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] font-semibold text-lime">${(a.priceCents / 100).toFixed(0)}</span>
                    )}
                    <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold ${full ? "bg-cream-deep text-ink-soft" : "bg-lime text-ink"}`}>
                      {open ? `${a.joined.length} ${t("going")}` : `${a.joined.length}/${a.spots}`}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex -space-x-2">
                      {a.joined.slice(0, 6).map((j) => (
                        <Avatar key={j.memberNo} member={j} photo={photoMap[j.memberNo]} size="h-8 w-8 text-[13px] border-2 border-cream" />
                      ))}
                    </div>
                    <span className="ml-2.5 font-mono text-[11px] font-medium text-ink-soft">
                      {a.joined.length > 6 ? `+${a.joined.length - 6} ${t("going")}` : t("going")}
                    </span>
                  </div>
                  {joined ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          const payload = {
                            title: "irlpass",
                            text: `join me for ${a.title} (${a.when}). it's on irlpass, the vetted travel club. here's your invite:`,
                            url: `https://irlpass.xyz/?screen=invite&a=${a.id}`,
                          }
                          try {
                            if (navigator.share) await navigator.share(payload)
                            else await navigator.clipboard.writeText(`${payload.text} ${payload.url}`)
                          } catch { /* sheet closed */ }
                        }}
                        className="rounded-full border border-line px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft active:scale-95"
                      >
                        {t("invite")}
                      </button>
                      {a.creator.memberNo === me.memberNo ? (
                        <button
                          onClick={async () => {
                            if (!confirm("delete this plan for everyone?")) return
                            await act({ action: "delete", id: a.id })
                          }}
                          className="rounded-full border border-line px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b3461f] active:scale-95"
                        >
                          {t("delete")}
                        </button>
                      ) : (
                        <button
                          onClick={() => act({ action: "leave", id: a.id })}
                          className="rounded-full border border-line px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft active:scale-95"
                        >
                          {t("leave")}
                        </button>
                      )}
                      <button
                        onClick={() => openChat(a.id, a.title, a)}
                        className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-cream active:scale-95"
                      >
                        {t("open chat")}
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      {justJoined === a.id && <MiniBurst />}
                      <button
                        disabled={full || busy}
                        onClick={async () => {
                          if (a.priceCents > 0) return payJoin(a)
                          const u = await act({ action: "join", id: a.id })
                          if (u) {
                            setJustJoined(a.id)
                            setTimeout(() => setJustJoined(null), 900)
                          }
                        }}
                        className="rounded-full bg-lime px-4 py-2 text-[12.5px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.15)] active:scale-95 disabled:opacity-40"
                      >
                        {full ? t("full") : a.priceCents > 0 ? `${t("rsvp")} · $${(a.priceCents / 100).toFixed(0)}` : t("i'm in")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------- members ---------- */
function Members({ token }) {
  const [members, setMembers] = useState(null)
  const [invited, setInvited] = useState(false)
  useEffect(() => {
    fetch(`/api/members?t=${token}`)
      .then((r) => r.json())
      .then((d) => setMembers(d.members || []))
      .catch(() => setMembers([]))
  }, [token])

  const invite = async () => {
    const payload = {
      title: "irlpass",
      text: "you'd get in. vetted travel club, medellín is city one. apply:",
      url: "https://irlpass.xyz",
    }
    try {
      if (navigator.share) await navigator.share(payload)
      else {
        await navigator.clipboard.writeText(`${payload.text} ${payload.url}`)
        setInvited(true)
        setTimeout(() => setInvited(false), 2200)
      }
    } catch { /* share sheet closed */ }
  }

  return (
    <div className="px-5 pb-28 pt-4">
      <h2 className="display text-[26px] font-bold">{t("the club")}</h2>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={invite}
        className="mt-4 w-full rounded-2xl border border-dashed border-lime-deep bg-lime/15 px-4 py-3.5 text-left"
      >
        <p className="text-[14.5px] font-semibold">{invited ? t("copied. send it to them") : t("know someone who'd fit?")}</p>
        <p className="mt-0.5 font-mono text-[10.5px] text-ink-soft">
          {t("invite them to apply. they still get vetted like everyone")}
        </p>
      </motion.button>
      {!members ? (
        <div className="mt-10 flex justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
      ) : (
        <div className="mt-4 divide-y divide-line/70 rounded-2xl border border-line bg-white/70">
          {members.map((m) => (
            <a
              key={m.memberNo}
              href={`https://instagram.com/${m.ig.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3"
            >
              <Avatar member={m} />
              <div className="min-w-0">
                <p className="flex items-baseline gap-1.5 text-[14.5px] font-semibold leading-tight">
                  {m.name.toLowerCase()}
                  <span className="translate-y-[0.5px] font-mono text-[11px] font-normal text-ink-soft">{m.ig}</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  nº {m.memberNo}{m.country ? ` · ${m.country}` : ""}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- chats ---------- */
function PinnedInfo({ token, me, initial }) {
  const [act, setAct] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(initial.details || "")
  const isCreator = act.creator.memberNo === me.memberNo

  const save = async () => {
    setEditing(false)
    const r = await fetch("/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, action: "update", id: act.id, details: text }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.activity) setAct(r.activity)
  }

  return (
    <div className="border-b border-line/70 bg-cream-deep/50 px-4 py-2.5">
      <div className="flex items-start gap-2">
        <span className="text-[15px]">{actEmojiOf(act)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
            {whenLine(act)}{act.place ? ` · ${act.place}` : ""} · {act.joined.length} {t("going")}
          </p>
          {editing ? (
            <div className="mt-1.5 flex gap-2">
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder={t("address, meeting point, what to bring…")}
                className="w-full rounded-lg border border-line bg-white/80 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-lime-deep"
              />
              <button onClick={save} className="shrink-0 rounded-full bg-ink px-3 py-1.5 font-mono text-[10px] font-semibold uppercase text-cream">{t("save")}</button>
            </div>
          ) : (
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink">
              {act.details || (isCreator ? t("no details yet") : "")}
              {isCreator && (
                <button onClick={() => { setText(act.details || ""); setEditing(true) }} className="ml-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-lime-deep underline underline-offset-2">
                  {act.details ? t("edit") : t("add details")}
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const REACT_SET = ["❤️", "😂", "🔥", "👍"]

function Thread({ token, me, channel, title, activity, onBack, photoMap = {} }) {
  const [server, setServer] = useState(null)
  // optimistic sends live separately so a stale poll can't wipe them off screen
  const [pending, setPending] = useState([])
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(null) // message key with the action bar open
  const [replyTo, setReplyTo] = useState(null) // message object being replied to
  const [editing, setEditing] = useState(null) // message object being edited
  const bottomRef = useRef(null)
  const pollRef = useRef(() => {})

  useEffect(() => {
    let alive = true
    const poll = () =>
      fetch(`/api/messages?t=${token}&channel=${channel}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d.messages) return
          setServer(d.messages)
          setPending((p) => p.filter((pm) => !d.messages.some((sm) => sm.text === pm.text && sm.from.memberNo === pm.from.memberNo)))
        })
        .catch(() => {})
    pollRef.current = poll
    poll()
    const iv = setInterval(poll, 2500)
    return () => { alive = false; clearInterval(iv) }
  }, [token, channel])

  const msgs = server === null ? null : [...server, ...pending]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [msgs?.length])

  const api = (body) =>
    fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, channel, ...body }),
    })
      .then(() => pollRef.current())
      .catch(() => {})

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText("")
    if (editing) {
      const target = editing
      setEditing(null)
      setServer((s) => s?.map((m) => (m.key === target.key ? { ...m, text: body, edited: true } : m)))
      await api({ action: "edit", id: target.key, text: body })
      return
    }
    const reply = replyTo
    setReplyTo(null)
    setPending((p) => [
      ...p,
      { text: body, from: me, at: new Date().toISOString(), reactions: {}, replyTo: reply?.key ?? null, key: "local-" + Date.now() + Math.random() },
    ])
    await api({ action: "send", text: body, replyTo: reply?.key ?? null })
  }

  const react = async (m, emoji) => {
    setFocused(null)
    setServer((s) =>
      s?.map((x) => {
        if (x.key !== m.key) return x
        const r = { ...x.reactions }
        const who = new Set(r[emoji] || [])
        who.has(me.memberNo) ? who.delete(me.memberNo) : who.add(me.memberNo)
        if (who.size) r[emoji] = [...who]
        else delete r[emoji]
        return { ...x, reactions: r }
      })
    )
    await api({ action: "react", id: m.key, emoji })
  }

  const remove = async (m) => {
    setFocused(null)
    setServer((s) => s?.map((x) => (x.key === m.key ? { ...x, deleted: true, text: "" } : x)))
    await api({ action: "delete", id: m.key })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line/70 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-12">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/60 active:scale-95" aria-label="back">
          <ArrowLeft size={16} weight="bold" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">{title}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            {channel === "medellin" ? t("city lobby · all members") : t("private · joined members only")}
          </p>
        </div>
      </div>

      {activity && <PinnedInfo token={token} me={me} initial={activity} />}
      {channel === "medellin" && (
        <div className="flex items-start gap-2.5 border-b border-line/70 bg-cream-deep/50 px-4 py-2.5">
          <PushPin size={14} weight="fill" className="mt-0.5 shrink-0 text-ink-soft" />
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-soft/70">{t("pinned")}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink">{t("the medellín lobby. say where you're staying and what you're into, then post a plan when you want company.")}</p>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4" onClick={() => setFocused(null)}>
        {/* mt-auto pins the conversation to the bottom, like every messenger */}
        <div className="mt-auto space-y-3">
          {!msgs ? (
            <div className="flex justify-center pb-8"><CircleNotch size={20} className="animate-spin text-ink-soft" /></div>
          ) : msgs.length === 0 ? (
            <p className="pb-8 text-center font-mono text-[11px] text-ink-soft">{t("no messages yet. say something.")}</p>
          ) : (
            msgs.map((m) => {
              const mine = m.from.memberNo === me.memberNo
              const system = m.from.memberNo === "000"
              const quoted = m.replyTo ? msgs.find((x) => x.key === m.replyTo) : null
              const reactions = Object.entries(m.reactions || {})

              if (system) {
                return (
                  <div key={m.key} className="flex justify-center">
                    <p className="max-w-[85%] rounded-full bg-cream-deep/80 px-4 py-1.5 text-center font-mono text-[10.5px] leading-relaxed text-ink-soft">
                      {m.text}
                    </p>
                  </div>
                )
              }

              return (
                <div key={m.key} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  {!mine && <Avatar member={m.from} photo={photoMap[m.from.memberNo]} size="h-7 w-7 text-[12px]" />}
                  <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      onClick={(e) => { e.stopPropagation(); if (!m.deleted) setFocused(focused === m.key ? null : m.key) }}
                      className={`rounded-2xl px-3.5 py-2 ${m.deleted ? "border border-dashed border-line bg-transparent" : mine ? "rounded-br-md bg-lime text-ink" : "rounded-bl-md border border-line bg-white/80 text-ink"}`}
                    >
                      {!mine && !m.deleted && (
                        <p className="font-mono text-[9.5px] font-semibold text-ink-soft">{m.from.name.toLowerCase()} · {m.from.memberNo}</p>
                      )}
                      {quoted && !m.deleted && (
                        <p className={`mb-1 truncate border-l-2 pl-2 text-[11.5px] ${mine ? "border-ink/30 text-ink/60" : "border-lime-deep text-ink-soft"}`}>
                          {quoted.deleted ? "deleted message" : `${quoted.from.name.toLowerCase()}: ${quoted.text}`}
                        </p>
                      )}
                      <p className={`text-[14px] leading-snug ${m.deleted ? "italic text-ink-soft/60" : ""}`}>
                        {m.deleted ? t("message deleted") : m.text}
                        {m.edited && !m.deleted && <span className="ml-1.5 font-mono text-[9px] text-ink/45">{t("(edited)")}</span>}
                      </p>
                    </div>

                    {reactions.length > 0 && (
                      <div className={`mt-1 flex gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                        {reactions.map(([em, who]) => (
                          <button
                            key={em}
                            onClick={(e) => { e.stopPropagation(); react(m, em) }}
                            className={`rounded-full border px-1.5 py-0.5 text-[11px] ${who.includes(me.memberNo) ? "border-lime-deep bg-lime/40" : "border-line bg-white/70"}`}
                          >
                            {em} {who.length > 1 ? who.length : ""}
                          </button>
                        ))}
                      </div>
                    )}

                    <AnimatePresence>
                      {focused === m.key && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.9 }}
                          transition={{ type: "spring", stiffness: 380, damping: 24 }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1.5 flex items-center gap-1 rounded-full border border-line bg-white px-2 py-1.5 shadow-[0_10px_24px_-12px_rgba(28,27,23,0.4)]"
                        >
                          {REACT_SET.map((em) => (
                            <button key={em} onClick={() => react(m, em)} className="px-1 text-[16px] active:scale-125">{em}</button>
                          ))}
                          <span className="mx-0.5 h-4 w-px bg-line" />
                          <button
                            onClick={() => { setReplyTo(m); setEditing(null); setFocused(null) }}
                            className="px-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                          >
                            {t("reply")}
                          </button>
                          {mine && (
                            <>
                              <button
                                onClick={() => { setEditing(m); setReplyTo(null); setText(m.text); setFocused(null) }}
                                className="px-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                              >
                                edit
                              </button>
                              <button onClick={() => remove(m)} className="px-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b3461f]">
                                delete
                              </button>
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line/70 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2.5">
        <AnimatePresence>
          {(replyTo || editing) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-2 flex items-center justify-between rounded-xl border border-line bg-cream-deep/70 px-3 py-1.5">
                <p className="truncate font-mono text-[10.5px] text-ink-soft">
                  {editing ? "editing your message" : `replying to ${replyTo.from.name.toLowerCase()}: ${replyTo.text.slice(0, 50)}`}
                </p>
                <button
                  onClick={() => { setReplyTo(null); setEditing(null); setText("") }}
                  className="ml-2 font-mono text-[10px] uppercase text-ink-soft"
                >
                  cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={editing ? t("edit message…") : t("message…")}
            className="w-full rounded-full border border-line bg-white/70 px-4 py-2.5 text-[14px] outline-none placeholder:text-ink-soft/50 focus:border-lime-deep"
          />
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={send}
            disabled={!text.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime text-ink disabled:opacity-40"
            aria-label="send"
          >
            <PaperPlaneRight size={17} weight="fill" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}

function Chats({ token, me, active, setActive, photoMap }) {
  const [acts, setActs] = useState([])
  const load = useCallback(() => {
    fetch(`/api/activities?t=${token}&scope=chats`)
      .then((r) => r.json())
      .then((d) => setActs(d.activities || []))
      .catch(() => {})
  }, [token])
  useEffect(load, [load, me.memberNo])

  // remove a chat from my list: creators delete it for everyone, members just leave
  const removeChat = async (a) => {
    const mine = a.creator.memberNo === me.memberNo
    if (mine && !confirm("you created this — delete it for everyone?")) return
    setActs((list) => list.filter((x) => x.id !== a.id))
    await fetch("/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, action: mine ? "delete" : "leave", id: a.id }),
    }).catch(() => {})
  }

  if (active) return <Thread token={token} me={me} photoMap={photoMap} channel={active.channel} title={active.title} activity={active.activity} onBack={() => setActive(null)} />

  return (
    <div className="px-5 pb-28 pt-4">
      <h2 className="display text-[26px] font-bold">chats</h2>
      <div className="mt-4 divide-y divide-line/70 rounded-2xl border border-line bg-white/70">
        <button onClick={() => setActive({ channel: "medellin", title: t("medellín lobby") })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime/60"><ColombiaFlag className="h-3 w-4.5" /></span>
          <div>
            <p className="text-[15px] font-semibold leading-tight">{t("medellín lobby")}</p>
            <p className="font-mono text-[10.5px] text-ink-soft">{t("all members · plans start here")}</p>
          </div>
        </button>
        {acts.map((a) => (
          <div key={a.id} className="flex items-center">
            <button onClick={() => setActive({ channel: a.id, title: a.title, activity: a })} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left">
              <ActIcon a={a} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight">{a.title}</p>
                <p className="font-mono text-[10.5px] text-ink-soft">{whenLine(a)} · {a.joined.length} {t("going")}</p>
              </div>
            </button>
            <button
              onClick={() => removeChat(a)}
              className="flex h-9 w-10 shrink-0 items-center justify-center pr-2 text-ink-soft/50 active:scale-90"
              aria-label={a.creator.memberNo === me.memberNo ? "delete chat" : "leave chat"}
              title={a.creator.memberNo === me.memberNo ? "delete (you created this)" : "leave chat"}
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        ))}
      </div>
      {acts.length === 0 && (
        <p className="mt-4 text-center font-mono text-[11px] text-ink-soft">{t("no plan chats yet. join one on the board.")}</p>
      )}
    </div>
  )
}

function DeniedScreen() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const sendLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return
    setSent(true)
    await fetch("/api/email-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => {})
  }
  return (
    <div className="flex min-h-[var(--app-h)] flex-col items-start justify-center px-7">
      <Logo h="h-10" />
      <h2 className="display mt-5 text-[30px] font-bold leading-tight">{t("members only.")}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        {t("this is the club side of irlpass. apply on the homepage and you'll get your own door key.")}
      </p>
      <button
        onClick={() => import("../lib/auth").then((m) => m.signInWithGoogle())}
        className="mt-6 w-full max-w-[320px] rounded-full bg-lime px-6 py-3.5 text-[14px] font-semibold text-ink active:scale-[0.98]"
      >
        {t("member sign in with google")}
      </button>
      {sent ? (
        <p className="mt-3 font-mono text-[11px] text-ink-soft">{t("if that email is in our system, a login link is on its way.")}</p>
      ) : (
        <div className="mt-3 flex w-full max-w-[320px] gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendLink()}
            placeholder={t("or email me my login link")}
            className="w-full rounded-full border border-line bg-white/70 px-4 py-3 text-[13px] outline-none placeholder:text-ink-soft/50 focus:border-lime-deep"
          />
          <button onClick={sendLink} className="shrink-0 rounded-full bg-ink px-4 py-3 text-[13px] font-semibold text-cream active:scale-95">
            {t("send")}
          </button>
        </div>
      )}
      <a href="/" className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft underline underline-offset-2">
        {t("or apply to join")}
      </a>
    </div>
  )
}

/* ---------- shell ---------- */
export default function Club({ token }) {
  const [me, setMe] = useState(null)
  const [state, setState] = useState("loading")
  const [tab, setTab] = useState("board")
  const [activeChat, setActiveChat] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [photoMap, setPhotoMap] = useState({})

  // photo lookup for avatars in chats and joined stacks
  useEffect(() => {
    if (state !== "ok") return
    fetch(`/api/members?t=${token}`)
      .then((r) => r.json())
      .then((d) => {
        const map = {}
        for (const m of d.members || []) if (m.photo) map[m.memberNo] = m.photo
        setPhotoMap(map)
      })
      .catch(() => {})
  }, [state, token, profileOpen])

  useEffect(() => {
    if (!token) return setState("denied")
    fetch(`/api/me?t=${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m) => {
        setMe(m)
        setState("ok")
        // remember this device so irlpass.xyz recognizes the member next visit
        localStorage.setItem("irlpass_member_token", token)
      })
      .catch(() => setState("denied"))
  }, [token])

  // returning from a paid-seat checkout: verify + add them, then clean the url
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const seat = p.get("seat")
    const session = p.get("session_id")
    if (seat && session && token) {
      fetch(`/api/seat-activate?t=${token}&id=${seat}&session_id=${encodeURIComponent(session)}`)
        .catch(() => {})
        .finally(() => {
          window.history.replaceState({}, "", `/?screen=app&t=${token}`)
        })
    }
  }, [token])

  if (state === "loading") {
    return <div className="flex min-h-[var(--app-h)] items-center justify-center"><CircleNotch size={26} className="animate-spin text-ink-soft" /></div>
  }
  if (state === "denied") {
    return <DeniedScreen />
  }

  const TABS = [
    { key: "board", label: t("board"), icon: CalendarPlus },
    { key: "members", label: t("members"), icon: UsersThree },
    { key: "chats", label: t("chats"), icon: ChatsCircle },
  ]
  const inThread = tab === "chats" && activeChat

  return (
    <div className="relative flex h-[var(--app-h)] flex-col">
      {!inThread && <TopBar me={me} onProfile={() => setProfileOpen(true)} />}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === "board" && <Board token={token} me={me} photoMap={photoMap} openChat={(channel, title, activity) => { setActiveChat({ channel, title, activity }); setTab("chats") }} />}
        {tab === "members" && <Members token={token} />}
        {tab === "chats" && <Chats token={token} me={me} photoMap={photoMap} active={activeChat} setActive={setActiveChat} />}
      </div>
      <AnimatePresence>
        {profileOpen && (
          <ProfileSheet
            token={token}
            me={me}
            onPhoto={(photo) => { setMe((m) => ({ ...m, photo })); setProfileOpen(false) }}
            onClose={() => setProfileOpen(false)}
          />
        )}
      </AnimatePresence>
      {!inThread && (
        <nav className="sticky bottom-0 z-10 flex border-t border-line/70 bg-cream/95 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); if (t.key !== "chats") setActiveChat(null) }} className="flex flex-1 flex-col items-center gap-0.5">
              <t.icon size={22} weight={tab === t.key ? "fill" : "regular"} className={tab === t.key ? "text-ink" : "text-ink-soft/60"} />
              <span className={`font-mono text-[9px] uppercase tracking-[0.12em] ${tab === t.key ? "text-ink" : "text-ink-soft/60"}`}>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
