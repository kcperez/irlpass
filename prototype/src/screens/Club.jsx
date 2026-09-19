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
import Trips from "./Trips"

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

// the cities irlpass knows — slugs MUST match api/_cities.js. medellín is live
// (seeded); the rest are browseable shells you can't free-join until we seed them.
const CITIES = [
  { slug: "medellin", name: "medellín", center: [-75.5812, 6.2442], live: true },
  { slug: "cdmx", name: "mexico city", center: [-99.1332, 19.4326], live: false },
  { slug: "miami", name: "miami", center: [-80.1918, 25.7617], live: false },
  { slug: "lisboa", name: "lisbon", center: [-9.1393, 38.7223], live: false },
  { slug: "bali", name: "bali", center: [115.1889, -8.4095], live: false },
]
const cityOf = (slug) => CITIES.find((c) => c.slug === slug) || CITIES[0]
const MDE_CENTER = CITIES[0].center

// women-only plans are visible/joinable only to women & non-binary members
const isWomanNb = (g) => g === "woman" || g === "nonbinary"

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

/* ---------- review + report ---------- */
// rate a meetup after it happens. the rating rolls up into the host's reputation.
function ReviewSheet({ token, activity, onClose }) {
  const [rating, setRating] = useState(0)
  const [note, setNote] = useState("")
  const [sent, setSent] = useState(false)
  const submit = async () => {
    if (!rating) return
    setSent(true)
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, activityId: activity.id, targetNo: activity.creator.memberNo, rating, note }),
    }).catch(() => {})
    setTimeout(onClose, 700)
  }
  const report = async () => {
    if (!confirm(t("report this plan to trust & safety? this is private."))) return
    await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, targetType: "activity", targetId: activity.id, reason: "reported from review" }),
    }).catch(() => {})
    onClose()
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/45 backdrop-blur-sm">
      <motion.div initial={{ y: 60 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-t-3xl bg-cream p-6 pb-9">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("how was it?")}</p>
        <h3 className="display mt-1 text-[20px] font-bold leading-snug">{actEmojiOf(activity)} {activity.title}</h3>
        <p className="mt-0.5 font-mono text-[11px] text-ink-soft">{t("by")} {activity.creator.name.toLowerCase()}</p>
        <div className="mt-4 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} className={`text-[30px] transition-transform active:scale-110 ${n <= rating ? "" : "opacity-25 grayscale"}`}>⭐</button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("a line about it (optional)")}
          className="mt-4 w-full border-b-2 border-line bg-transparent pb-1.5 text-[13.5px] outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
        />
        <button onClick={submit} disabled={!rating || sent} className="mt-5 w-full rounded-full bg-ink py-3 text-[14px] font-semibold text-cream disabled:opacity-35">
          {sent ? t("thanks 🤝") : t("post review")}
        </button>
        <button onClick={report} className="mt-2 w-full py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#b3461f]/80">
          {t("something felt off — report privately")}
        </button>
      </motion.div>
    </motion.div>
  )
}

function ProfileSheet({ token, me, onPhoto, onSafety, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [qr, setQr] = useState(null)
  const [past, setPast] = useState([])
  const [reviewOf, setReviewOf] = useState(null) // activity being reviewed

  const saveSafety = async (patch) => {
    onSafety?.(patch) // optimistic
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, ...patch }),
    }).catch(() => {})
  }

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
            <p className="flex items-center gap-1.5 display text-[20px] font-bold leading-tight">
              {me.name.toLowerCase()}
              {me.verified && <span title="verified" className="text-[14px] text-lime-deep">✓</span>}
            </p>
            <p className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
              {me.ig} · nº {me.memberNo}
              {me.repScore != null && <span className="rounded-full bg-cream-deep px-1.5 py-0.5 text-[9.5px] font-semibold">⭐ {me.repScore.toFixed(1)} · {me.repCount} {t("vouches")}</span>}
            </p>
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
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("your memories")}</p>
            <div className="mt-2 space-y-2">
              {past.slice(0, 5).map((a) => {
                const host = a.creator.memberNo !== me.memberNo
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <p className="min-w-0 text-[13px] text-ink">
                      {actEmojiOf(a)} {a.title} <span className="font-mono text-[10.5px] text-ink-soft">· {dayLabel(a.date)}</span>
                    </p>
                    {host && (
                      <button
                        onClick={() => setReviewOf(a)}
                        className="shrink-0 rounded-full border border-line bg-cream px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft active:scale-95"
                      >
                        {t("review")}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* women-safety controls — who can reach you, who sees your instagram */}
        {isWomanNb(me.gender) && (
          <div className="mt-4 rounded-2xl border border-line bg-[#f3d9e6]/25 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">🌸 {t("safety")}</p>
            <label className="mt-2.5 flex items-center justify-between">
              <span className="text-[13px]">{t("allow dms from men")}</span>
              <button
                onClick={() => saveSafety({ allowDmFromMen: !me.allowDmFromMen })}
                className={`relative h-6 w-11 rounded-full transition-colors ${me.allowDmFromMen ? "bg-lime-deep" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${me.allowDmFromMen ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </label>
            <label className="mt-2 flex items-center justify-between">
              <span className="text-[13px]">{t("show my instagram to men")}</span>
              <button
                onClick={() => saveSafety({ showIgToMen: !me.showIgToMen })}
                className={`relative h-6 w-11 rounded-full transition-colors ${me.showIgToMen ? "bg-lime-deep" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${me.showIgToMen ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </label>
          </div>
        )}

        {reviewOf && <ReviewSheet token={token} activity={reviewOf} onClose={() => setReviewOf(null)} />}

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

// typed location that resolves itself via google maps ("pueblito paisa" -> pick
// from real places, pinned to the city the plan is being created in)
function PlaceInput({ value, onChange, city }) {
  const [q, setQ] = useState(value?.name || "")
  const [status, setStatus] = useState(value ? "found" : "idle") // idle | looking | found | missing
  const [suggestions, setSuggestions] = useState([])
  const timer = useRef(null)

  const lookup = (text) => {
    clearTimeout(timer.current)
    const query = text.trim()
    if (query.length < 3) { onChange(null); setStatus("idle"); setSuggestions([]); return }
    setStatus("looking")
    timer.current = setTimeout(async () => {
      try {
        const d = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&city=${encodeURIComponent(city || "")}`).then((r) => r.json())
        if (d.found) {
          // best match auto-pins; the rest populate a picker underneath
          onChange({ name: d.name, lat: d.lat, lng: d.lng })
          setStatus("found")
          setSuggestions((d.suggestions || []).slice(0, 4))
        } else {
          onChange({ name: query.toLowerCase(), lat: null, lng: null })
          setStatus("missing")
          setSuggestions([])
        }
      } catch {
        onChange({ name: query.toLowerCase(), lat: null, lng: null })
        setStatus("missing")
        setSuggestions([])
      }
    }, 600)
  }

  const pick = (s) => {
    onChange({ name: s.name, lat: s.lat, lng: s.lng })
    setQ(s.name)
    setStatus("found")
    setSuggestions([])
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
      {suggestions.length > 1 && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-line bg-white/80">
          {suggestions.map((s, i) => (
            <button
              key={`${s.lat},${s.lng}`}
              type="button"
              onClick={() => pick(s)}
              className={`flex w-full items-baseline gap-2 px-3 py-2 text-left active:bg-cream-deep/60 ${i > 0 ? "border-t border-line/60" : ""} ${value?.name === s.name ? "bg-lime/20" : ""}`}
            >
              <span className="truncate text-[13px] font-medium">📍 {s.name}</span>
              {s.address && <span className="truncate font-mono text-[10px] text-ink-soft">{s.address}</span>}
            </button>
          ))}
        </div>
      )}
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
function MapView({ acts, me, onJoin, onPayJoin, onLocked, onOpenChat, onPlanSuggestion, busy, photoMap = {}, center = MDE_CENTER, isHome = true }) {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [selected, setSelected] = useState(null) // { type: "activity"|"suggestion", data }
  const [planWhen, setPlanWhen] = useState("")

  useEffect(() => {
    const map = new maplibregl.Map({
      container: wrapRef.current,
      style: MAP_STYLE,
      center,
      zoom: 12,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    return () => map.remove()
  }, [])

  // glide to the city in view when the user switches cities
  useEffect(() => {
    const map = mapRef.current
    if (map) map.flyTo({ center, zoom: 12, duration: 900 })
  }, [center[0], center[1]])

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

    // real activities: lime pins (locked = muted cream pin with a lock, can browse not join)
    acts.forEach((a, i) => {
      const lng = a.lng ?? center[0] + (i % 5) * 0.004 - 0.008
      const lat = a.lat ?? center[1] + ((i * 7) % 5) * 0.004 - 0.008
      const el = document.createElement("div")
      const icon = a.image
        ? `<img src="${a.image}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;border:1px solid #1c1b17"/>`
        : `<span style="font-size:14px">${actEmojiOf(a)}</span>`
      const bg = a.locked ? "#e7e3d8" : "#cdee45"
      const lock = a.locked ? `<span style="font-size:10px">🔒</span>` : ""
      el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;background:${bg};border:2px solid #1c1b17;border-radius:999px;padding:3px 9px 3px 4px;box-shadow:0 4px 10px rgba(28,27,23,.25);font:600 12px Geist,sans-serif;color:#1c1b17">${icon} ${a.joined.length}${a.spots >= 999 ? "" : "/" + a.spots}${lock}</div>`
      mk(lng, lat, el, () => setSelected({ type: "activity", data: a }))
    })

    // founder suggestions only in your home city (you can only create plans there for free)
    if (isHome) {
      SUGGESTIONS.filter((s) => !acts.some((a) => a.title === s.title)).forEach((s) => {
        const el = document.createElement("div")
        el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;background:#f4f1ea;border:2px dashed #b5da2e;border-radius:999px;padding:4px 9px;font:600 11px Geist,sans-serif;color:#57544a">✦ ${emojiFor(s.title)}</div>`
        mk(s.lng, s.lat, el, () => { setPlanWhen(""); setSelected({ type: "suggestion", data: s }) })
      })
    }
  }, [acts, center[0], center[1], isHome])

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
                {a.joined.slice(0, 12).map((j) => (
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
                {a.joined.length > 12 && (
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-deep font-mono text-[12px] font-semibold text-ink-soft">+{a.joined.length - 12}</span>
                    <span className="font-mono text-[9.5px] text-ink-soft">{t("more")}</span>
                  </div>
                )}
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
              ) : a.locked ? (
                <button
                  onClick={() => { onLocked(a.city); setSelected(null) }}
                  className="w-full rounded-full border-2 border-ink bg-cream py-3 text-[13.5px] font-semibold text-ink active:scale-[0.98]"
                >
                  ✦ {t("unlock")} {cityOf(a.city).name}
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
function Board({ token, me, openChat, photoMap = {}, refresh }) {
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
  const [womenOnly, setWomenOnly] = useState(false) // create: women & non-binary plan
  const [busy, setBusy] = useState(false)

  // your home city (where your phone is = free to join) vs the city you're browsing
  const homeCity = me.city || "medellin"
  const [viewCity, setViewCity] = useState(homeCity)
  const [cityPicker, setCityPicker] = useState(false)
  const [paywallCity, setPaywallCity] = useState(null) // slug -> show contextual paywall
  const [filterWomen, setFilterWomen] = useState(false) // board filter: women-only plans
  const isHome = viewCity === homeCity
  // board list respects the women-only filter (map view filters inline)
  const shown = acts ? (filterWomen ? acts.filter((a) => a.audience === "women_nb") : acts) : null

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (file) setPhoto(await resizeImage(file))
  }

  const load = useCallback(() => {
    fetch(`/api/activities?t=${token}&city=${viewCity}`)
      .then((r) => r.json())
      .then((d) => setActs(d.activities || []))
      .catch(() => setActs([]))
  }, [token, viewCity])
  useEffect(load, [load, refresh])

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
    // hit a cross-city gate? pop the contextual paywall instead of silently failing
    if (r?.gate === "city") { setPaywallCity(r.city || viewCity); return null }
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
    if (r?.gate === "city") return setPaywallCity(r.city || viewCity)
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
      city: homeCity, // suggestions only seed in your home city
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
            acts={filterWomen ? acts.filter((a) => a.audience === "women_nb") : acts}
            me={me}
            busy={busy}
            photoMap={photoMap}
            center={cityOf(viewCity).center}
            isHome={isHome}
            onJoin={async (id) => { await act({ action: "join", id }) }}
            onLocked={(c) => setPaywallCity(c)}
            onOpenChat={openChat}
            onPayJoin={payJoin}
            onPlanSuggestion={planSuggestion}
          />
          <div className="pointer-events-none absolute left-1/2 top-2.5 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-cream/95 px-3.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft shadow-sm">
            {isHome ? t("tap a pin to join · ✦ = suggested") : `${cityOf(viewCity).name} · ${t("browsing — join with a pass")}`}
          </div>
        </div>
        {paywallCity && <PaywallSheet token={token} city={paywallCity} onClose={() => setPaywallCity(null)} />}
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

      {/* city switcher + women-only filter — browse any city free, join your own */}
      <div className="relative mt-3 flex items-center gap-2">
        <button
          onClick={() => setCityPicker((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-line bg-white/70 px-3.5 py-2 text-[13px] font-semibold active:scale-95"
        >
          <MapPin size={14} weight="fill" className="text-lime-deep" />
          {cityOf(viewCity).name}
          {!isHome && <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-soft">· {t("browsing")}</span>}
        </button>
        <button
          onClick={() => setFilterWomen((v) => !v)}
          className={`rounded-full border px-3.5 py-2 text-[12.5px] font-semibold active:scale-95 ${filterWomen ? "border-ink bg-[#f3d9e6] text-ink" : "border-line bg-white/70 text-ink-soft"}`}
        >
          🌸 {t("women only")}
        </button>
        <AnimatePresence>
          {cityPicker && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute left-0 top-12 z-20 w-56 overflow-hidden rounded-2xl border border-line bg-cream shadow-[0_18px_40px_-18px_rgba(28,27,23,0.5)]"
            >
              {CITIES.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => { setViewCity(c.slug); setCityPicker(false) }}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] active:bg-cream-deep/50 ${c.slug === viewCity ? "bg-cream-deep/40 font-semibold" : ""}`}
                >
                  <span>{c.name}</span>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-soft">
                    {c.slug === homeCity ? t("you're here") : c.live ? t("live") : t("soon")}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
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
              <PlaceInput value={place} onChange={setPlace} city={viewCity} />
              <input
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t("details (address, what to bring…) optional")}
                className="mt-3 w-full border-b-2 border-line bg-transparent pb-1.5 text-[13px] outline-none placeholder:text-ink-soft/40 focus:border-lime-deep"
              />
              {!isHome && (
                <p className="mt-3 rounded-xl bg-[#f3d9e6]/50 px-3 py-2 font-mono text-[10.5px] text-ink-soft">
                  {t("you're browsing")} {cityOf(viewCity).name}. {t("hosting here needs a pass.")}
                </p>
              )}
              {isWomanNb(me.gender) && (
                <label className="mt-3 flex items-center justify-between rounded-xl border border-line bg-[#f3d9e6]/30 p-3">
                  <span className="text-[13px] font-medium">🌸 {t("women & non-binary only")}</span>
                  <button
                    type="button"
                    onClick={() => setWomenOnly((v) => !v)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${womenOnly ? "bg-[#d98cb3]" : "bg-line"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${womenOnly ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </label>
              )}
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
                  const created = await act({ action: "create", title, when: when.trim() || "flexible", date, spots, place, emoji: actEmoji || emojiFor(title), details, priceCents: charge ? Math.round(parseFloat(price || "0") * 100) : null, city: viewCity, audience: womenOnly ? "women_nb" : "open" })
                  if (created && photo) {
                    await fetch("/api/activity-photo", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ t: token, id: created.id, image: photo }),
                    }).catch(() => {})
                    load()
                  }
                  setTitle(""); setWhen(""); setDate(bogotaTodayISO()); setPlace(null); setActEmoji(null); setDetails(""); setPhoto(null); setCharge(false); setPrice("15"); setWomenOnly(false); setCreating(false)
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
      ) : shown.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="text-[15px] font-medium">
            {filterWomen ? t("no women-only plans here yet") : isHome ? t("nothing on the board yet") : `${t("nothing in")} ${cityOf(viewCity).name} ${t("yet")}`}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {isHome ? t("post the first plan. someone's waiting for exactly it.") : t("plans show up here as members land. check back.")}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {shown.map((a) => {
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
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center">
                      <div className="flex -space-x-2">
                        {a.joined.slice(0, 5).map((j) => (
                          <Avatar key={j.memberNo} member={j} photo={photoMap[j.memberNo]} size="h-8 w-8 text-[13px] border-2 border-cream" />
                        ))}
                      </div>
                      <span className="ml-2.5 whitespace-nowrap font-mono text-[11px] font-medium text-ink-soft">
                        {a.joined.length > 5 ? `+${a.joined.length - 5} ${t("going")}` : t("going")}
                      </span>
                    </div>
                    {!joined && (a.locked ? (
                      <button
                        onClick={() => setPaywallCity(a.city)}
                        className="shrink-0 rounded-full border-2 border-ink bg-cream px-4 py-2.5 text-[12.5px] font-semibold text-ink active:scale-95"
                      >
                        ✦ {t("unlock")} {cityOf(a.city).name}
                      </button>
                    ) : (
                      <div className="relative shrink-0">
                        {justJoined === a.id && <MiniBurst />}
                        <button
                          disabled={full || busy}
                          onClick={async () => {
                            if (a.priceCents > 0) return payJoin(a)
                            const u = await act({ action: "join", id: a.id })
                            if (u) { setJustJoined(a.id); setTimeout(() => setJustJoined(null), 900) }
                          }}
                          className="rounded-full bg-lime px-5 py-2.5 text-[13px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.15)] active:scale-95 disabled:opacity-40"
                        >
                          {full ? t("full") : a.priceCents > 0 ? `${t("rsvp")} · $${(a.priceCents / 100).toFixed(0)}` : t("i'm in")}
                        </button>
                      </div>
                    ))}
                  </div>
                  {joined && (
                    <div className="mt-3 flex gap-2">
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
                        className="flex-1 rounded-full border border-line py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft active:scale-95"
                      >
                        {t("invite")}
                      </button>
                      {a.creator.memberNo === me.memberNo ? (
                        <button
                          onClick={async () => {
                            if (!confirm("delete this plan for everyone?")) return
                            await act({ action: "delete", id: a.id })
                          }}
                          className="flex-1 rounded-full border border-line py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#b3461f] active:scale-95"
                        >
                          {t("delete")}
                        </button>
                      ) : (
                        <button
                          onClick={() => act({ action: "leave", id: a.id })}
                          className="flex-1 rounded-full border border-line py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft active:scale-95"
                        >
                          {t("leave")}
                        </button>
                      )}
                      <button
                        onClick={() => openChat(a.id, a.title, a)}
                        className="flex-[1.4] rounded-full bg-ink py-2.5 text-[12.5px] font-semibold text-cream active:scale-95"
                      >
                        {t("open chat")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {paywallCity && <PaywallSheet token={token} city={paywallCity} onClose={() => setPaywallCity(null)} />}
    </div>
  )
}

/* ---------- contextual paywall ---------- */
// fires the moment a free member taps something out of their home city (or a DM
// to a stranger). this is the whole freemium conversion surface — the want is
// already there, so we sell against it instead of walling the door.
function PaywallSheet({ token, city, reason = "city", onClose }) {
  const cityName = cityOf(city)?.name || city
  const lines =
    reason === "dm"
      ? { head: t("message anyone, anywhere"), sub: t("dms beyond your shared plans are a pass perk.") }
      : { head: `${t("unlock")} ${cityName}`, sub: t("browse every city free. join the plans with a pass.") }
  const go = async (plan) => {
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, plan }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.url) window.location.href = r.url
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-t-3xl border-t border-line bg-cream p-6 pb-9"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-lime-deep">
          <Sparkle size={12} weight="fill" /> {t("irlpass pass")}
        </p>
        <h3 className="display mt-1.5 text-[26px] font-bold leading-tight">{lines.head}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{lines.sub}</p>
        <ul className="mt-4 space-y-2 text-[13.5px]">
          {[t("join plans in any city you travel to"), t("host your own anywhere"), t("dm any member, not just shared plans"), t("the full member list, everywhere")].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-0.5 text-lime-deep">✦</span> {f}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          <button onClick={() => go("yearly")} className="flex-1 rounded-2xl bg-ink py-3.5 text-center text-cream active:scale-[0.98]">
            <span className="block text-[14px] font-semibold">{t("yearly")}</span>
            <span className="block font-mono text-[10px] text-cream/60">{t("best value")}</span>
          </button>
          <button onClick={() => go("monthly")} className="flex-1 rounded-2xl border border-line bg-white/70 py-3.5 text-center active:scale-[0.98]">
            <span className="block text-[14px] font-semibold">{t("monthly")}</span>
            <span className="block font-mono text-[10px] text-ink-soft">{t("cancel anytime")}</span>
          </button>
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
          {t("keep browsing free")}
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ---------- members ---------- */
// a small reputation chip: average meetup rating + how many vouches
function RepBadge({ score, count, verified }) {
  return (
    <span className="flex items-center gap-1.5">
      {verified && <span title="verified" className="text-lime-deep">✓</span>}
      {score != null && (
        <span className="rounded-full bg-cream-deep px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-ink-soft">
          ⭐ {score.toFixed(1)}{count ? `·${count}` : ""}
        </span>
      )}
    </span>
  )
}

function Members({ token, me, onOpenDM }) {
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
            <div key={m.memberNo} className="flex items-center gap-3 px-4 py-3">
              <a href={`https://instagram.com/${m.ig.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar member={m} />
                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5 text-[14.5px] font-semibold leading-tight">
                    {m.name.toLowerCase()}
                    <span className="translate-y-[0.5px] font-mono text-[11px] font-normal text-ink-soft">{m.ig}</span>
                  </p>
                  <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    nº {m.memberNo}{m.country ? ` · ${m.country}` : ""}
                    <RepBadge score={m.repScore} count={m.repCount} verified={m.verified} />
                  </p>
                </div>
              </a>
              {m.memberNo !== me?.memberNo && (
                <button
                  onClick={() => onOpenDM(m)}
                  className="shrink-0 rounded-full border border-line bg-cream px-3 py-2 active:scale-95"
                  aria-label={`message ${m.name}`}
                >
                  <PaperPlaneRight size={15} weight="fill" className="text-ink-soft" />
                </button>
              )}
            </div>
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

  const changeIcon = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const image = await resizeImage(file)
    const r = await fetch("/api/activity-photo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, id: act.id, image }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.image) setAct((a) => ({ ...a, image: r.image }))
  }

  return (
    <div className="border-b border-line/70 bg-cream-deep/50 px-4 py-2.5">
      <div className="flex items-start gap-2.5">
        {isCreator ? (
          <label className="relative shrink-0 cursor-pointer">
            <ActIcon a={act} size="h-9 w-9 text-[15px]" />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-cream text-[8px]">✎</span>
            <input type="file" accept="image/*" className="hidden" onChange={changeIcon} />
          </label>
        ) : (
          <ActIcon a={act} size="h-9 w-9 text-[15px]" />
        )}
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
            {channel === me.city ? t("everyone in town right now") : t("private · joined members only")}
          </p>
        </div>
      </div>

      {activity && <PinnedInfo token={token} me={me} initial={activity} />}
      {channel === "medellin" && (
        <div className="flex items-start gap-2.5 border-b border-line/70 bg-cream-deep/50 px-4 py-2.5">
          <PushPin size={14} weight="fill" className="mt-0.5 shrink-0 text-ink-soft" />
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-soft/70">{t("pinned")}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink">{t("say hi, say where you're at, find someone to go with.")}</p>
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
        <button onClick={() => setActive({ channel: "medellin", title: t("medellín crew") })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime/60"><ColombiaFlag className="h-3 w-4.5" /></span>
          <div>
            <p className="text-[15px] font-semibold leading-tight">{t("medellín crew")}</p>
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

/* ---------- direct messages ---------- */
// free to dm anyone you've shared a plan with; reaching strangers needs a pass.
function DMScreen({ token, me, openWith, setOpenWith, onPaywall, photoMap = {} }) {
  const [threads, setThreads] = useState(null)
  const [convo, setConvo] = useState(null) // { with, messages }
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  const loadInbox = useCallback(() => {
    fetch(`/api/dm?t=${token}`).then((r) => r.json()).then((d) => setThreads(d.threads || [])).catch(() => setThreads([]))
  }, [token])

  const loadConvo = useCallback((no) => {
    fetch(`/api/dm?t=${token}&with=${no}`).then((r) => r.json()).then((d) => setConvo(d)).catch(() => setConvo({ with: null, messages: [] }))
  }, [token])

  useEffect(() => {
    if (openWith) { setConvo(null); loadConvo(openWith.memberNo) }
    else { setConvo(null); loadInbox() }
  }, [openWith, loadConvo, loadInbox])

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [convo])

  const send = async () => {
    const body = text.trim()
    if (!body || !openWith) return
    setBusy(true)
    const r = await fetch("/api/dm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, to: openWith.memberNo, text: body }),
    }).then((x) => x.json()).catch(() => null)
    setBusy(false)
    if (r?.gate === "dm" || r?.gate === "unlock") return onPaywall(r.gate)
    if (r?.error) return alert(r.error)
    setText("")
    loadConvo(openWith.memberNo)
  }

  // a single conversation
  if (openWith) {
    const other = convo?.with || openWith
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <button onClick={() => setOpenWith(null)} className="text-ink-soft active:scale-90"><ArrowLeft size={20} /></button>
          <Avatar member={other} photo={photoMap[other.memberNo]} size="h-9 w-9 text-[14px]" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[14.5px] font-semibold leading-tight">{other.name?.toLowerCase()} <RepBadge score={other.repScore} verified={other.verified} /></p>
            <p className="font-mono text-[10px] text-ink-soft">{other.ig}</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {!convo ? (
            <div className="flex flex-1 items-center justify-center"><CircleNotch size={20} className="animate-spin text-ink-soft" /></div>
          ) : convo.messages.length === 0 ? (
            <p className="mt-6 text-center font-mono text-[11px] text-ink-soft">{t("say hi. you met on a plan — pick it back up.")}</p>
          ) : (
            convo.messages.map((m) => (
              <div key={m.key} className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] ${m.fromMe ? "self-end bg-lime text-ink" : "self-start bg-white/80 text-ink"}`}>
                {m.text}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t("message…")}
            className="w-full rounded-full border border-line bg-white/70 px-4 py-2.5 text-[14px] outline-none focus:border-lime-deep"
          />
          <button onClick={send} disabled={busy || !text.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-cream active:scale-95 disabled:opacity-40">
            <PaperPlaneRight size={17} weight="fill" />
          </button>
        </div>
      </div>
    )
  }

  // the inbox
  return (
    <div className="px-5 pb-28 pt-4">
      <h2 className="display text-[26px] font-bold">{t("messages")}</h2>
      {!threads ? (
        <div className="mt-10 flex justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
      ) : threads.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="text-[15px] font-medium">{t("no messages yet")}</p>
          <p className="mt-1 text-[13px] text-ink-soft">{t("join a plan, meet people, then message them here.")}</p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-line/70 rounded-2xl border border-line bg-white/70">
          {threads.map((th) => (
            <button key={th.with.memberNo} onClick={() => setOpenWith(th.with)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-cream-deep/30">
              <Avatar member={th.with} photo={photoMap[th.with.memberNo]} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[14.5px] font-semibold leading-tight">{th.with.name.toLowerCase()} <RepBadge score={th.with.repScore} verified={th.with.verified} /></p>
                <p className="truncate font-mono text-[11px] text-ink-soft">{th.lastFromMe ? "you: " : ""}{th.last}</p>
              </div>
              {th.unread > 0 && <span className="shrink-0 rounded-full bg-lime px-2 py-0.5 font-mono text-[10px] font-semibold text-ink">{th.unread}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- shell ---------- */
export default function Club({ token }) {
  const [me, setMe] = useState(null)
  const [state, setState] = useState("loading")
  const [tab, setTab] = useState("trips")
  const [activeChat, setActiveChat] = useState(null)
  const [dmWith, setDmWith] = useState(null) // member object when a thread is open
  const [paywall, setPaywall] = useState(null) // reason string -> show paywall
  const [profileOpen, setProfileOpen] = useState(false)
  const [photoMap, setPhotoMap] = useState({})
  const [refresh, setRefresh] = useState(0)
  const [unlockRequest, setUnlockRequest] = useState(0)

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
        // geolocate: your phone's city becomes your free home city. silently
        // updates me.city server-side so the join gate follows where you actually are.
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              fetch("/api/set-city", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ t: token, lat: pos.coords.latitude, lng: pos.coords.longitude }),
              })
                .then((r) => r.json())
                .then((d) => { if (d?.matched && d.city) setMe((cur) => (cur ? { ...cur, city: d.city } : cur)) })
                .catch(() => {})
            },
            () => {}, // denied / unavailable -> keep saved city
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
          )
        }
      })
      .catch(() => setState("denied"))
  }, [token])

  // returning from a paid-seat checkout: verify + add them, refresh the board, clean the url
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const seat = p.get("seat")
    const session = p.get("session_id")
    if (seat && session && token) {
      fetch(`/api/seat-activate?t=${token}&id=${seat}&session_id=${encodeURIComponent(session)}`)
        .catch(() => {})
        .finally(() => {
          setRefresh((x) => x + 1) // re-fetch the board so the card flips to "joined"
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
    { key: "trips", label: "dates", icon: CalendarPlus },
    { key: "members", label: t("members"), icon: UsersThree },
    { key: "dms", label: t("dms"), icon: PaperPlaneRight },
    { key: "chats", label: t("chats"), icon: ChatsCircle },
  ]
  const inThread = (tab === "chats" && activeChat) || (tab === "dms" && dmWith)

  return (
    <div className="relative flex h-[var(--app-h)] flex-col">
      {!inThread && <TopBar me={me} onProfile={() => setProfileOpen(true)} />}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === "trips" && <Trips token={token} me={me} unlockRequest={unlockRequest} onOpenDM={(m) => { setDmWith(m); setTab("dms") }} />}
        {tab === "board" && <Board token={token} me={me} photoMap={photoMap} refresh={refresh} openChat={(channel, title, activity) => { setActiveChat({ channel, title, activity }); setTab("chats") }} />}
        {tab === "members" && <Members token={token} me={me} onOpenDM={(m) => { setDmWith(m); setTab("dms") }} />}
        {tab === "dms" && <DMScreen token={token} me={me} openWith={dmWith} setOpenWith={setDmWith} photoMap={photoMap} onPaywall={(r) => { if (r === "unlock") { setTab("trips"); setUnlockRequest(Date.now()) } else setPaywall(r) }} />}
        {tab === "chats" && <Chats token={token} me={me} photoMap={photoMap} active={activeChat} setActive={setActiveChat} />}
      </div>
      <AnimatePresence>
        {profileOpen && (
          <ProfileSheet
            token={token}
            me={me}
            onPhoto={(photo) => { setMe((m) => ({ ...m, photo })); setProfileOpen(false) }}
            onSafety={(patch) => setMe((m) => ({ ...m, ...patch }))}
            onClose={() => setProfileOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {paywall && <PaywallSheet token={token} city={me.city} reason={paywall} onClose={() => setPaywall(null)} />}
      </AnimatePresence>
      {!inThread && (
        <nav className="sticky bottom-0 z-10 flex border-t-2 border-line/70 bg-cream/95 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
          {TABS.map((tb) => (
            <button key={tb.key} onClick={() => { setTab(tb.key); if (tb.key !== "chats") setActiveChat(null); if (tb.key !== "dms") setDmWith(null) }} className="flex flex-1 flex-col items-center gap-0.5">
              <span className={`flex h-9 w-14 items-center justify-center rounded-full transition-colors ${tab === tb.key ? "bg-lime" : ""}`}>
                <tb.icon size={22} weight={tab === tb.key ? "fill" : "regular"} className={tab === tb.key ? "text-ink" : "text-ink-soft/60"} />
              </span>
              <span className={`text-[10px] font-bold ${tab === tb.key ? "text-ink" : "text-ink-soft/60"}`}>{tb.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
