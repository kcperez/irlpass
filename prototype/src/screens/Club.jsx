import { useEffect, useRef, useState, useCallback } from "react"
import { cachedJson } from "../lib/cached"
import { motion, AnimatePresence, MotionConfig } from "framer-motion"
import {
  CalendarPlus,
  UsersThree,
  ChatsCircle,
  ArrowLeft,
  PaperPlaneRight,
  Sparkle,
  CircleNotch,
  CheckCircle,
  SignOut,
  PushPin,
} from "@phosphor-icons/react"
import QRCode from "qrcode"
import { Logo } from "../components/bits"
import { t, LANG } from "../lib/i18n"
import Trips from "./Trips"
import Around from "./Around"
import Mood from "./Mood"
import PersonSheet from "../components/PersonSheet"
import World from "../components/World"
import { cityChip, registerCities } from "../lib/cities"

// mod powers are on only in mod mode; member view tests the regular experience
const modOn = (me) => !!me?.isMod && !me?.memberView
import { VIBES, MIN_VIBES, vibeLabel } from "../lib/vibes"

const CITIES = [
  { slug: "medellin", name: "medellín", center: [-75.5812, 6.2442], live: true },
  { slug: "cdmx", name: "mexico city", center: [-99.1332, 19.4326], live: false },
  { slug: "miami", name: "miami", center: [-80.1918, 25.7617], live: false },
  { slug: "lisboa", name: "lisbon", center: [-9.1393, 38.7223], live: false },
  { slug: "bali", name: "bali", center: [115.1889, -8.4095], live: false },
]
const cityOf = (slug) => CITIES.find((c) => c.slug === slug) || CITIES[0]

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

function VerifyCard({ token, me, onVerified }) {
  const [code, setCode] = useState(null)
  const [copied, setCopied] = useState(false)
  const [state, setState] = useState("idle") // idle | checking | failed
  const [msg, setMsg] = useState("")

  useEffect(() => {
    fetch(`/api/verify?t=${token}`).then((r) => r.json()).then((d) => setCode(d.code)).catch(() => {})
  }, [token])

  const check = async () => {
    setState("checking")
    setMsg("")
    const r = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.ok) { setState("done"); onVerified?.() }
    else { setState("failed"); setMsg(r?.error || t("could not check right now")) }
  }

  if (me.verified || state === "done") {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-[1.5rem] border-2 border-ink bg-lime px-4 py-3">
        <CheckCircle size={20} weight="fill" />
        <p className="text-[13.5px] font-bold">{t("instagram verified")}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-[1.5rem] border-2 border-line bg-white/70 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("verify your instagram")}</p>
      <p className="mt-1.5 text-[13.5px] leading-snug">
        {t("1. tap the code to copy it. 2. paste it anywhere in your instagram bio. 3. come back and tap check. it proves the account is yours, and you can leave it there.")}
      </p>
      {/* the whole code is the copy button: testers didn't find the small one */}
      <button
        onClick={async () => {
          if (!code) return
          try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch { /* clipboard blocked */ }
        }}
        className={`mt-2.5 flex w-full items-center justify-between rounded-[1rem] border-2 border-dashed px-3 py-2.5 text-left ${copied ? "border-ink bg-lime" : "border-line bg-cream"}`}
      >
        <code className="text-[15px] font-bold tracking-wide">{code || "…"}</code>
        <span className="text-[12px] font-bold">{copied ? t("copied ✓") : t("tap to copy")}</span>
      </button>
      <a
        href="https://www.instagram.com/accounts/edit/"
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex w-full items-center justify-center rounded-full border-2 border-ink py-2.5 text-[13.5px] font-bold"
      >
        {t("open instagram to edit my bio")}
      </a>
      <button
        onClick={check}
        disabled={state === "checking"}
        className="mt-2.5 w-full rounded-full bg-ink py-3 text-[14px] font-bold text-cream disabled:opacity-50"
      >
        {state === "checking" ? t("checking…") : t("check my bio")}
      </button>
      {msg && <p className="mt-2 text-[12.5px] text-[#8f2b2b]">{msg}</p>}
    </div>
  )
}

function ProfileSheet({ token, me, onPhoto, onSafety, onVibes, onClose }) {
  const [hasDates, setHasDates] = useState(false)
  useEffect(() => {
    fetch(`/api/trips?t=${token}`)
      .then((r) => r.json())
      .then((d) => setHasDates((d.trips || []).length > 0))
      .catch(() => {})
  }, [token])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [qr, setQr] = useState(null)
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
        className="max-h-[92%] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-cream px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line" />
        <div className="mt-5 flex items-center gap-4">
          <Avatar member={me} photo={me.photo} size="h-16 w-16 text-[26px]" />
          <div>
            <p className="flex items-center gap-1.5 display text-[20px] font-bold leading-tight">
              {me.name.toLowerCase()}
              {me.verified && <span title="verified" className="text-[14px] text-lime-deep">✓</span>}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-soft">
              <a
                href={`https://instagram.com/${String(me.ig).replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-ink underline underline-offset-2"
              >
                {me.ig}
              </a>
              {me.igFollowers != null && (
                <span className="font-semibold">{me.igFollowers.toLocaleString()} {t("followers")}</span>
              )}
              <span>nº {me.memberNo}</span>
              {modOn(me) && <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold text-ink">{t("co-founder")}</span>}
            </p>
          </div>
        </div>
        <label className={`mt-5 flex w-full cursor-pointer items-center justify-center rounded-full bg-lime px-6 py-3.5 text-[14.5px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)] ${busy ? "opacity-60" : ""}`}>
          {busy ? t("uploading…") : me.photo ? t("change your photo") : t("add your photo")}
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
        </label>
        {error && <p className="mt-2.5 text-center text-[12.5px] font-medium text-[#b3461f]">{error}</p>}
        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft/70">
          {t("your face shows next to your dates")}
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

        

        <button
          onClick={onVibes}
          className="mt-4 flex w-full items-center justify-between rounded-[1.5rem] border-2 border-line bg-white/70 px-4 py-3.5 text-left"
        >
          <span className="text-[14px] font-bold">{t("your vibes")}</span>
          <span className="truncate pl-3 text-[12.5px] font-semibold text-ink-soft">
            {(me.interests || []).length ? (me.interests || []).slice(0, 3).map(vibeLabel).join(", ") : t("pick yours")}
          </span>
        </button>

        {modOn(me) && (
          <a
            href={`/?screen=ops&t=${token}`}
            className="mt-4 flex items-center justify-between rounded-[1.5rem] border-2 border-ink bg-lime px-4 py-3.5"
          >
            <span className="text-[14px] font-bold">{t("ops dashboard")}</span>
            <span className="text-[12px] font-semibold">{t("co-founder")}</span>
          </a>
        )}

        {/* prove the handle is yours. only once they've posted dates, so it
            isn't the first thing asked of someone who hasn't seen anything yet */}
        {(me.verified || hasDates) && (
          <VerifyCard token={token} me={me} onVerified={() => onSafety?.({ verified: true })} />
        )}

        {/* who can reach you. everyone gets these, not only women */}
        <div className="mt-4 rounded-[1.5rem] border-2 border-line bg-white/70 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{t("who can message you")}</p>
          <label className="mt-2.5 flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">{t("people can message me")}</span>
            <button
              onClick={() => saveSafety({ allowDmFromMen: !me.allowDmFromMen })}
              className={`relative h-6 w-11 rounded-full transition-colors ${me.allowDmFromMen ? "bg-lime-deep" : "bg-line"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${me.allowDmFromMen ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
          <label className="mt-2 flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">{t("show my instagram")}</span>
            <button
              onClick={() => saveSafety({ showIgToMen: !me.showIgToMen })}
              className={`relative h-6 w-11 rounded-full transition-colors ${me.showIgToMen ? "bg-lime-deep" : "bg-line"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${me.showIgToMen ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
          <p className="mt-2 text-[12px] text-ink-soft">{t("off means only women and non-binary members can start a chat with you.")}</p>
        </div>

        {reviewOf && <ReviewSheet token={token} activity={reviewOf} onClose={() => setReviewOf(null)} />}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              try { localStorage.removeItem("irlpass_member_token") } catch { /* private mode */ }
              window.location.href = "/"
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-line py-3 text-[13px] font-bold text-ink-soft"
          >
            <SignOut size={15} weight="bold" /> {t("sign out")}
          </button>
          <button
            onClick={async () => {
              if (!confirm(t("this deletes your account, your dates and your messages. it can't be undone."))) return
              await fetch(`/api/account?t=${token}`, { method: "DELETE" }).catch(() => {})
              try { localStorage.removeItem("irlpass_member_token") } catch { /* private mode */ }
              window.location.href = "/"
            }}
            className="flex-1 rounded-full border-2 border-line py-3 text-[13px] font-bold text-[#8f2b2b]"
          >
            {t("delete account")}
          </button>
        </div>

        {/* the member pass (qr) comes back when there are events to scan it at.
            until then it was a button that did nothing. */}
        {me.billing && (
          <button
            onClick={async () => {
              const r = await fetch("/api/portal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ t: token }),
              }).then((x) => x.json()).catch(() => null)
              if (r?.url) window.location.href = r.url
            }}
            className="mt-2 w-full rounded-full border-2 border-line py-3 text-[12.5px] font-bold text-ink-soft"
          >
            {t("manage subscription")}
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}

// typed location that resolves itself via google maps ("pueblito paisa" -> pick
// from real places, pinned to the city the plan is being created in)
function TopBar({ me, onProfile }) {
  return (
    <header className={`sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-cream/95 px-5 pb-3 backdrop-blur ${me?.isMod ? "pt-3" : "pt-[max(1rem,env(safe-area-inset-top))] md:pt-12"}`}>
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
          {[t("message anyone whose dates overlap yours"), t("every city, every window"), t("no per-trip unlocks"), t("verified badge included")].map((f) => (
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

// a rough read of whether a message is in the other language than the reader's,
// so the translate link shows up on its own where it's useful
const ES_WORDS = /\b(que|de|el|la|los|las|y|en|por|para|con|una|es|está|hola|gracias|bien|vamos|pero|mañana|noche|quién|donde|dónde|también|parce|muy|hoy)\b/gi
const EN_WORDS = /\b(the|and|is|are|you|to|of|in|for|with|who|what|where|tonight|tomorrow|going|anyone|here|this|that|hey|thanks|yeah)\b/gi
const looksForeign = (text) => {
  const es = (String(text).match(ES_WORDS) || []).length
  const en = (String(text).match(EN_WORDS) || []).length
  return LANG === "es" ? en >= 2 && en > es : es >= 2 && es > en
}

const dayKey = (at) => new Date(at).toDateString()
const chatDay = (at) => {
  const d = new Date(at)
  const today = new Date()
  const y = new Date(); y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return t("today")
  if (d.toDateString() === y.toDateString()) return t("yesterday")
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }).toLowerCase()
}

// "9:41 pm", or "tue 9:41 pm" when it wasn't today
const msgTime = (at) => {
  if (!at) return ""
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ""
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()
  const today = new Date().toDateString() === d.toDateString()
  return today ? time : `${d.toLocaleDateString([], { weekday: "short" }).toLowerCase()} ${time}`
}

// the chat box grows with what you type, up to ~5 lines, then scrolls inside.
// enter sends, shift+enter is a new line.
function Composer({ id, value, onChange, onSend, placeholder }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      id={id}
      name="message"
      rows={1}
      autoComplete="off"
      data-lpignore="true"
      data-form-type="other"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend() }
      }}
      placeholder={placeholder}
      className="max-h-32 w-full resize-none overflow-y-auto rounded-[1.3rem] border border-line bg-white/80 px-4 py-2.5 text-[14px] leading-snug outline-none placeholder:text-ink-soft/50 focus:border-lime-deep"
    />
  )
}

// @name in a message renders bold
function WithMentions({ text }) {
  const parts = String(text).split(/(@[\w.]{2,30})/g)
  return parts.map((part, i) =>
    part.startsWith("@") ? <span key={i} className="font-bold">{part}</span> : part
  )
}

function Thread({ token, me, channel, title, activity, onBack, photoMap = {}, onNeedDates, onSeen, onOpenPerson }) {
  const [needsDates, setNeedsDates] = useState(false)

  const [server, setServer] = useState(null)
  // whatever is on screen counts as read
  useEffect(() => {
    // server is null until the first load: reading .length on it crashed the room
    const last = Array.isArray(server) && server.length ? server[server.length - 1] : null
    if (last) onSeen?.(last.key)
  }, [server, onSeen])
  // optimistic sends live separately so a stale poll can't wipe them off screen
  const [pending, setPending] = useState([])
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(null) // message key with the action bar open
  const [replyTo, setReplyTo] = useState(null) // message object being replied to
  const [editing, setEditing] = useState(null) // message object being edited
  const [translated, setTranslated] = useState({}) // key -> translated text | "loading" | "error"
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

  const api = async (body) => {
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, channel, ...body }),
      })
      const d = await r.json().catch(() => ({}))
      if (d?.gate === "dates") {
        setPending([])
        setNeedsDates(true)
        return
      }
      pollRef.current()
    } catch { /* offline */ }
  }

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

  const translate = async (m) => {
    setFocused(null)
    if (translated[m.key] && translated[m.key] !== "error") {
      // second tap goes back to the original
      setTranslated((x) => { const n = { ...x }; delete n[m.key]; return n })
      return
    }
    setTranslated((x) => ({ ...x, [m.key]: "loading" }))
    const r = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, text: m.text, to: LANG }),
    }).then((x) => x.json()).catch(() => null)
    setTranslated((x) => ({ ...x, [m.key]: r?.text || "error" }))
  }

  // @mention suggestions: people who've spoken in this room, matching what's typed after @
  const mentionQuery = (text.match(/@([\w.]*)$/) || [])[1]
  const mentionPool = mentionQuery === undefined || !msgs
    ? []
    : [...new Map(msgs.filter((m) => m.from.memberNo !== me.memberNo && m.from.memberNo !== "000").map((m) => [m.from.memberNo, m.from])).values()]
        .filter((f) => {
          const q = mentionQuery.toLowerCase()
          const handle = String(f.ig || "").replace(/^@+/, "").toLowerCase()
          return !q || f.name.toLowerCase().includes(q) || handle.includes(q)
        })
        .slice(0, 5)
  const mentionTag = (f) => String(f.ig || "").replace(/^@+/, "") || f.name.trim().split(/\s+/)[0]

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
            {/* city rooms are open to everyone in town; only old activity threads are private */}
            {activity
              ? t("private · joined members only")
              : channel.startsWith("spot-")
                ? t("everyone going tonight")
                : t("everyone in town right now")}
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
            msgs.map((m, i) => {
              const mine = m.from.memberNo === me.memberNo
              const system = m.from.memberNo === "000"
              const quoted = m.replyTo ? msgs.find((x) => x.key === m.replyTo) : null
              const reactions = Object.entries(m.reactions || {})
              // messenger-style grouping: same person within 5 minutes is one run.
              // name on the first, avatar on the last, a day line when the day changes.
              const prev = msgs[i - 1]
              const next = msgs[i + 1]
              const sameRun = (a, b) =>
                a && b && a.from.memberNo === b.from.memberNo && a.from.memberNo !== "000" &&
                Math.abs(new Date(b.at) - new Date(a.at)) < 5 * 60e3 && dayKey(a.at) === dayKey(b.at)
              const first = !sameRun(prev, m)
              const last = !sameRun(m, next)
              const newDay = !prev || dayKey(prev.at) !== dayKey(m.at)
              const dayLine = newDay && (
                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{chatDay(m.at)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )

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
                <div key={m.key} className={first ? "pt-2" : "-mt-2"}>
                {dayLine}
                <div id={`msg-${m.key}`} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  {!mine && (last
                    ? (
                      <button onClick={(e) => { e.stopPropagation(); onOpenPerson?.(m.from.memberNo) }} className="shrink-0 active:scale-95">
                        <Avatar member={m.from} photo={m.from.photo || photoMap[m.from.memberNo]} size="h-8 w-8 text-[12px]" />
                      </button>
                    )
                    : <span className="w-8 shrink-0" />)}
                  <div className={`min-w-0 max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                    {!mine && first && !m.deleted && (
                      <p className="mb-0.5 ml-1 text-[12px] font-bold text-ink">
                        {m.from.name.split(" ")[0]}
                        <span className="font-normal text-ink-soft"> · {msgTime(m.at)}</span>
                      </p>
                    )}
                    <div
                      onClick={(e) => { e.stopPropagation(); if (!m.deleted) setFocused(focused === m.key ? null : m.key) }}
                      className={`min-w-0 max-w-full break-words px-3.5 py-2 [overflow-wrap:anywhere] ${
                        m.deleted
                          ? "rounded-[1.2rem] border border-dashed border-line bg-transparent"
                          : mine
                            ? `rounded-[1.2rem] bg-lime text-ink ${last ? "rounded-br-md" : ""}`
                            : `rounded-[1.2rem] bg-white text-ink shadow-[0_1px_2px_rgba(58,50,44,0.08)] ${last ? "rounded-bl-md" : ""}`
                      }`}
                    >
                      {/* the quote clamps to two lines. it used to be one unwrapped line,
                          which pushed a long quote's bubble past the edge of the screen */}
                      {m.replyTo && !m.deleted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            document.getElementById(`msg-${m.replyTo}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
                          }}
                          className={`mb-1 w-full border-l-2 pl-2 text-left text-[11.5px] leading-snug line-clamp-2 ${mine ? "border-ink/30 text-ink/60" : "border-lime-deep text-ink-soft"}`}
                        >
                          {!quoted
                            ? t("an earlier message")
                            : quoted.deleted
                              ? t("deleted message")
                              : `${quoted.from.name.toLowerCase()}: ${quoted.text}`}
                        </button>
                      )}
                      <p className={`whitespace-pre-wrap text-[14px] leading-snug ${m.deleted ? "italic text-ink-soft/60" : ""}`}>
                        {m.deleted ? t("message deleted") : m.text.startsWith("📍 ") ? (
                          <span className="font-semibold"><span className="out-dot mr-1.5 inline-block h-2 w-2 rounded-full bg-[#5fd35f] align-middle" />{m.text.slice(2)}</span>
                        ) : <WithMentions text={m.text} />}
                        {m.edited && !m.deleted && <span className="ml-1.5 font-mono text-[9px] text-ink/45">{t("(edited)")}</span>}
                        {mine && !m.deleted && <span className="ml-1.5 whitespace-nowrap font-mono text-[9px] text-ink/45">{msgTime(m.at)}</span>}
                      </p>
                      {translated[m.key] && !m.deleted && (
                        <p className="mt-1 border-t border-ink/10 pt-1 text-[13.5px] italic leading-snug">
                          {translated[m.key] === "loading"
                            ? t("translating…")
                            : translated[m.key] === "error"
                              ? t("couldn't translate that right now")
                              : translated[m.key]}
                        </p>
                      )}
                    </div>

                    {!m.deleted && !mine && !translated[m.key] && looksForeign(m.text) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); translate(m) }}
                        className="mt-0.5 px-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                      >
                        {t("translate")}
                      </button>
                    )}

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
                          <button
                            onClick={() => translate(m)}
                            className="px-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                          >
                            {translated[m.key] && translated[m.key] !== "error" ? t("original") : t("translate")}
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
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

        {needsDates && (
          <button
            onClick={() => onNeedDates?.(channel)}
            className="mx-3 mb-2 flex items-center gap-3 rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3 text-left"
          >
            <img src="/art/icon-dates.png" alt="" className="h-10 w-10 shrink-0 object-contain" draggable="false" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold leading-tight">{t("post your dates to write here")}</p>
              <p className="text-[12px] text-ink-soft">{t("the room is for people who'll actually be in town")}</p>
            </div>
          </button>
        )}
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
        {mentionPool.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto">
            {mentionPool.map((f) => (
              <button
                key={f.memberNo}
                onClick={() => setText((x) => x.replace(/@([\w.]*)$/, `@${mentionTag(f)} `))}
                className="shrink-0 rounded-full border-2 border-line bg-white/80 px-3 py-1 text-[12.5px] font-bold"
              >
                @{mentionTag(f)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Composer
            id="room-composer"
            value={text}
            onChange={setText}
            onSend={send}
            placeholder={editing ? t("edit message…") : t("message…")}
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
        {t("this link didn't open an account. log in below, or start on the homepage: it takes 20 seconds.")}
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
        {t("or join on the homepage")}
      </a>
    </div>
  )
}

/* ---------- direct messages ---------- */
// free to dm anyone you've shared a plan with; reaching strangers needs a pass.
function DMScreen({ token, me, openWith, setOpenWith, onPaywall, photoMap = {}, onNeedDates, onOpenPerson, onOpenWorld }) {
  const [roomOpen, setRoomOpen] = useState(false)
  const [rooms, setRooms] = useState([])
  const [roomCity, setRoomCity] = useState(me.city || "medellin")

  const [cityCounts, setCityCounts] = useState({})
  const [roomUnread, setRoomUnread] = useState({}) // city -> how many you haven't seen

  const seenKey = (city) => `irlpass_seen_${city}`
  const markRoomSeen = (city, lastId) => {
    try { if (lastId) localStorage.setItem(seenKey(city), String(lastId)) } catch { /* private mode */ }
    setRoomUnread((u) => ({ ...u, [city]: 0 }))
  }
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then((d) => setCityCounts(d.membersByCity || {})).catch(() => {})
  }, [])

  // how many messages arrived in each room since you last looked
  useEffect(() => {
    if (!rooms.length) return
    let cancelled = false
    const check = async () => {
      const next = {}
      for (const c of rooms) {
        try {
          const d = await fetch(`/api/messages?t=${token}&channel=${c}`).then((r) => r.json())
          const msgs = d.messages || []
          let seen = 0
          try { seen = Number(localStorage.getItem(seenKey(c)) || 0) } catch { /* private mode */ }
          next[c] = msgs.filter((m) => Number(m.key) > seen && m.from?.memberNo !== me.memberNo).length
        } catch { next[c] = 0 }
      }
      if (!cancelled) setRoomUnread(next)
    }
    check()
    const id = setInterval(check, 30000)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms.join(","), token])

  // every city you have dates in gets its own room
  useEffect(() => {
    fetch(`/api/trips?t=${token}`)
      .then((r) => r.json())
      .then((d) => {
        const cities = [...new Set((d.trips || []).map((x) => x.city))]
        setRooms(cities.length ? cities : [me.city || "medellin"])
        if (cities.length && !cities.includes(roomCity)) setRoomCity(cities[0])
        // mods (josh, kevin) moderate every room, not only the cities they have dates in
        if (modOn(me)) {
          fetch("/api/stats")
            .then((r) => r.json())
            .then((st) => {
              const all = Object.keys(st.byCity || {})
              setRooms((prev) => [...new Set([...prev, ...all])])
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
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

  const [dmTranslated, setDmTranslated] = useState({}) // key -> text | "loading" | "error"
  const translateDm = async (m) => {
    if (dmTranslated[m.key] && dmTranslated[m.key] !== "error") {
      return setDmTranslated((x) => { const n = { ...x }; delete n[m.key]; return n })
    }
    setDmTranslated((x) => ({ ...x, [m.key]: "loading" }))
    const r = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, text: m.text, to: LANG }),
    }).then((x) => x.json()).catch(() => null)
    setDmTranslated((x) => ({ ...x, [m.key]: r?.text || "error" }))
  }

  const send = async (override) => {
    const body = (typeof override === "string" ? override : text).trim()
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
    if (typeof override !== "string") setText("")
    loadConvo(openWith.memberNo)
  }

  // trust before meeting: one tap asks for a short video call first
  const askVideo = () =>
    send(t("📹 before we meet up, want to do a quick video call to say hi? send me a time that works."))

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
            <p className="mt-6 text-center font-mono text-[11px] text-ink-soft">{t("say hi. you're in the same city on the same days.")}</p>
          ) : (
            convo.messages.map((m) => (
              <div key={m.key} className={`flex max-w-[78%] flex-col ${m.fromMe ? "items-end self-end" : "items-start self-start"}`}>
                <div
                  onClick={() => !m.fromMe && translateDm(m)}
                  className={`max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] [overflow-wrap:anywhere] ${m.fromMe ? "bg-lime text-ink" : "bg-white/80 text-ink"}`}
                >
                  {m.text}
                  <span className="ml-1.5 whitespace-nowrap font-mono text-[9px] text-ink/45">{msgTime(m.at)}</span>
                  {dmTranslated[m.key] && (
                    <p className="mt-1 border-t border-ink/10 pt-1 italic">
                      {dmTranslated[m.key] === "loading"
                        ? t("translating…")
                        : dmTranslated[m.key] === "error"
                          ? t("couldn't translate that right now")
                          : dmTranslated[m.key]}
                    </p>
                  )}
                </div>
                {!m.fromMe && !dmTranslated[m.key] && looksForeign(m.text) && (
                  <button onClick={() => translateDm(m)} className="mt-0.5 px-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                    {t("translate")}
                  </button>
                )}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        {convo && !convo.messages.some((m) => m.text.startsWith("📹")) && (
          <button
            onClick={askVideo}
            disabled={busy}
            className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-full border-2 border-line bg-white/70 py-2 text-[12.5px] font-bold text-ink-soft disabled:opacity-40"
          >
            📹 {t("ask for a quick video call first")}
          </button>
        )}
        <div className="flex items-end gap-2 border-t border-line px-3 py-2.5">
          <Composer id="dm-composer" value={text} onChange={setText} onSend={() => send()} placeholder={t("message…")} />
          <button onClick={() => send()} disabled={busy || !text.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-cream active:scale-95 disabled:opacity-40">
            <PaperPlaneRight size={17} weight="fill" />
          </button>
        </div>
      </div>
    )
  }

  const cityName = cityChip(roomCity).name.toLowerCase()

  if (roomOpen) {
    return (
      <Thread
        token={token}
        me={me}
        photoMap={photoMap}
        channel={roomCity}
        title={`${cityChip(roomCity).emoji}  ${cityName} chat`}
        onBack={() => setRoomOpen(false)}
        onOpenPerson={onOpenPerson}
        onNeedDates={onNeedDates}
        onSeen={(lastId) => markRoomSeen(roomCity, lastId)}
      />
    )
  }

  // the inbox
  return (
    <div className="px-5 pb-28 pt-4">
      <h2 className="display text-[30px] font-bold">{t("chat")}</h2>

      {rooms.map((c) => (
        <button
          key={c}
          onClick={() => { setRoomCity(c); setRoomOpen(true) }}
          className="lift mt-3 flex w-full items-center gap-3 rounded-[1.5rem] border-2 border-ink bg-lime px-4 py-4 text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-cream text-[26px] leading-none" aria-hidden>
            {cityChip(c).emoji}
          </span>
          <div className="min-w-0">
            <p className="display text-[19px] font-bold leading-tight">{cityChip(c).name.toLowerCase()} {t("chat")}</p>
            <p className="text-[12.5px] text-ink-soft">
              {cityCounts[c] ? `${cityCounts[c]} ${t("here")}` : t("everyone in town right now")}
            </p>
          </div>
          {roomUnread[c] > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-ink px-2.5 py-1 text-[12px] font-bold text-cream">
              {roomUnread[c]}
            </span>
          )}
        </button>
      ))}
      <button
        onClick={onOpenWorld}
        className="mt-3 flex w-full items-center gap-3 rounded-[1.5rem] border-2 border-dashed border-line bg-white/70 px-4 py-3.5 text-left active:scale-[0.99]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[24px]">🌍</span>
        <div className="min-w-0">
          <p className="display text-[17px] font-bold leading-tight">{t("every city's chat")}</p>
          <p className="text-[12.5px] text-ink-soft">{t("see where irlpass is right now and who's talking")}</p>
        </div>
      </button>
      {me.memberNo !== "002" && (
        <button
          onClick={() => setOpenWith({ memberNo: "002", name: "Josh", ig: "@jawshmac" })}
          className="mt-2 flex w-full items-center gap-3 rounded-[1.5rem] border-2 border-line bg-white/70 px-4 py-3.5 text-left active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-[18px]">👋</span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight">{t("josh · irlpass")}</p>
            <p className="text-[12.5px] text-ink-soft">{t("stuck on something? he answers")}</p>
          </div>
        </button>
      )}

      {!threads ? (
        <div className="mt-10 flex justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
      ) : threads.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="text-[15px] font-semibold">{t("no dms yet")}</p>
          <p className="mt-1 text-[13px] text-ink-soft">{t("say hi to someone on your dates and it lands here.")}</p>
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

/* ---------- a real name, for members whose name is only their handle ---------- */
function NameSheet({ token, me, onSaved, onClose }) {
  const [name, setName] = useState("")
  const [err, setErr] = useState("")
  const save = async () => {
    const r = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, name }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.ok) onSaved(r.name || name.trim())
    else setErr(r?.error || t("could not save that"))
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex items-end bg-ink/40" onClick={onClose}>
      <motion.div
        initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-[1.75rem] border-t-2 border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        <h2 className="display text-[26px] font-bold leading-tight">{t("what should people call you?")}</h2>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {t("right now you show up as")} <strong>{me.name}</strong>. {t("people meet a person, not a handle.")}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          autoFocus
          autoComplete="given-name"
          maxLength={30}
          placeholder={t("your first name")}
          className="mt-4 w-full rounded-[1.4rem] border-2 border-line bg-white/80 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink"
        />
        {err && <p className="mt-2 text-[13px] font-semibold text-[#8f2b2b]">{err}</p>}
        <button onClick={save} disabled={name.trim().length < 2} className="mt-3 w-full rounded-full bg-ink py-4 text-[15px] font-bold text-cream disabled:opacity-40">
          {t("save")}
        </button>
        <button onClick={onClose} className="mt-1 w-full py-2 text-center text-[13px] text-ink-soft underline">{t("later")}</button>
      </motion.div>
    </motion.div>
  )
}

/* ---------- vibes, for members who joined before the vibes step ---------- */
// shown once per visit until they pick. "reactivation hook": pick your vibes,
// see who you'd click with. it ranks people, it never hides anyone.
function VibesSheet({ token, me, onSaved, onClose }) {
  const [picked, setPicked] = useState(() => (me.interests || []).filter((i) => VIBES.some((v) => v.key === i)))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, vibesSeen: true }),
    }).catch(() => {})
  }, [token])

  const save = async () => {
    setBusy(true)
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, interests: picked }),
    }).catch(() => {})
    onSaved(picked)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-end bg-ink/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90%] w-full overflow-y-auto rounded-t-[1.75rem] border-t-2 border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        <h2 className="display text-[26px] font-bold leading-tight">{t("what's your vibe?")}</h2>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {t("pick at least 3. we put people who like the same things at the top.")}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {VIBES.map((v) => {
            const on = picked.includes(v.key)
            return (
              <motion.button
                key={v.key}
                whileTap={{ scale: 0.94 }}
                onClick={() => setPicked((l) => (on ? l.filter((x) => x !== v.key) : [...l, v.key]))}
                className={`flex aspect-[1/0.85] flex-col items-center justify-center gap-1 rounded-[1.2rem] border-2 px-1 text-center ${on ? "border-ink bg-lime" : "border-line bg-white/70"}`}
              >
                <span className="text-[24px] leading-none">{v.emoji}</span>
                <span className={`text-[11.5px] font-bold leading-tight ${on ? "text-ink" : "text-ink-soft"}`}>{vibeLabel(v.key)}</span>
              </motion.button>
            )
          })}
        </div>
        <button
          onClick={save}
          disabled={picked.length < MIN_VIBES || busy}
          className="mt-4 w-full rounded-full bg-ink py-4 text-[15px] font-bold text-cream disabled:opacity-40"
        >
          {picked.length < MIN_VIBES ? `${picked.length} / ${MIN_VIBES}` : t("show me who i'd click with")}
        </button>
        <button onClick={onClose} className="mt-1 w-full py-2 text-center text-[13px] text-ink-soft underline">
          {t("later")}
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ---------- mod mode vs member view ---------- */
// kevin and josh test both sides. a strip that can't be missed says which one
// they're in, and one tap flips it (the server enforces it, the page reloads).
function ModeStrip({ token, me }) {
  const [busy, setBusy] = useState(false)
  if (!me?.isMod) return null
  const member = !!me.memberView
  const flip = async () => {
    setBusy(true)
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, testAsMember: !member }),
    }).catch(() => {})
    try { sessionStorage.removeItem("irlpass_vibes_asked") } catch { /* private mode */ }
    window.location.reload()
  }
  return (
    <button
      onClick={flip}
      disabled={busy}
      className={`flex w-full items-center justify-between gap-2 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-left ${
        member ? "bg-peach text-ink" : "bg-ink text-cream"
      }`}
    >
      <span className="min-w-0">
        <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
          {member ? "member view" : "mod mode"}
        </span>
        <span className="block truncate text-[11.5px] font-semibold opacity-80">
          {member
            ? "you see exactly what a regular free member sees"
            : "every room, no paywalls, ops dashboard"}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold ${member ? "bg-ink text-cream" : "bg-lime text-ink"}`}>
        {busy ? "switching…" : member ? "back to mod" : "test as member"}
      </span>
    </button>
  )
}

/* ---------- shell ---------- */
export default function Club({ token }) {
  const [me, setMe] = useState(null)
  const [state, setState] = useState("loading")
  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("dm")) return "dms"
    const wanted = { chat: "dms", people: "members", dates: "trips", mood: "mood" }[p.get("tab")]
    return wanted || "trips"
  })
  const [activeChat, setActiveChat] = useState(null)
  const [dmWith, setDmWith] = useState(() => {
    const no = new URLSearchParams(window.location.search).get("dm")
    return no ? { memberNo: no, name: `nº ${no}`, ig: "" } : null
  }) // member object when a thread is open
  const [paywall, setPaywall] = useState(null) // reason string -> show paywall
  const [profileOpen, setProfileOpen] = useState(false)
  const [photoMap, setPhotoMap] = useState({})
  const [, setRefresh] = useState(0)
  const [unlockRequest, setUnlockRequest] = useState(0)
  const [closeSheets, setCloseSheets] = useState(0)
  const [postCity, setPostCity] = useState(null)
  const [viewCity, setViewCity] = useState(null) // the city you last added or opened
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [vibesOpen, setVibesOpen] = useState(false)
  const [spotRoom, setSpotRoom] = useState(null) // { channel, title } of a spot's room tonight
  const [dmReturn, setDmReturn] = useState(null) // the tab "say hi" was tapped on, so back goes there
  const [personNo, setPersonNo] = useState(null) // whose profile is open
  const [worldOpen, setWorldOpen] = useState(false) // the "where irlpass is" map
  const [cityRoom, setCityRoom] = useState(null) // another city's chat, opened from the map
  const [peopleKey, setPeopleKey] = useState(0) // bump to reload the people grid after vibes change

  const [nameOpen, setNameOpen] = useState(false)
  useEffect(() => {
    if (state !== "ok" || !me?.needsName) return
    let asked = false
    try { asked = !!sessionStorage.getItem("irlpass_name_asked") } catch { /* private mode */ }
    if (!asked) setNameOpen(true)
  }, [state, me?.needsName])
  const closeName = () => {
    try { sessionStorage.setItem("irlpass_name_asked", "1") } catch { /* private mode */ }
    setNameOpen(false)
  }

  // members from before the vibes step get asked once per visit (after the name)
  useEffect(() => {
    if (state !== "ok" || !me || (me.needsName && nameOpen)) return
    let asked = false
    try { asked = !!sessionStorage.getItem("irlpass_vibes_asked") } catch { /* private mode */ }
    if ((me.interests || []).filter((i) => VIBES.some((v) => v.key === i)).length < MIN_VIBES && !asked) {
      const id = setTimeout(() => setVibesOpen(true), 900)
      return () => clearTimeout(id)
    }
  }, [state, me, nameOpen])
  const closeVibes = () => {
    try { sessionStorage.setItem("irlpass_vibes_asked", "1") } catch { /* private mode */ }
    setVibesOpen(false)
  }

  // flags + names for every real city in use, so rooms and chips have an identity
  const [, setCitiesReady] = useState(0)
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => { registerCities(d.cityMeta); setCitiesReady((x) => x + 1) })
      .catch(() => {})
  }, [])

  // the chat tab shows a dot when anything is waiting
  useEffect(() => {
    if (state !== "ok") return
    const check = () =>
      fetch(`/api/dm?t=${token}`)
        .then((r) => r.json())
        .then((d) => setUnreadTotal((d.threads || []).reduce((n, th) => n + (th.unread || 0), 0)))
        .catch(() => {})
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [state, token])

  // photo lookup for avatars in chats and joined stacks
  useEffect(() => {
    if (state !== "ok") return
    fetch(`/api/members?t=${token}`)
      .then((r) => r.json())
      .then((d) => {
        const map = {}
        // the people api returns people (with dates) and others (without); the old
        // "members" list is gone, which left every chat avatar an emoji
        for (const m of [...(d.people || []), ...(d.others || []), ...(d.members || [])]) {
          if (m.photo && !m.locked) map[m.memberNo] = m.photo
        }
        setPhotoMap(map)
      })
      .catch(() => {})
  }, [state, token, profileOpen])

  useEffect(() => {
    if (!token) return setState("denied")
    cachedJson(`/api/me?t=${token}`, (m) => {
        setMe(m)
        setState("ok")
        // remember this device so irlpass.xyz recognizes the member next visit
        localStorage.setItem("irlpass_member_token", token)
        // no geolocation: where you are is where your dates say you are
      })
      // a cached profile already on screen stays up if the network blips
      .catch(() => setState((st) => (st === "ok" ? st : "denied")))
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

  // josh's order: dates and chat together, tonight's mood next to people
  const TABS = [
    { key: "trips", label: t("dates"), icon: CalendarPlus },
    { key: "dms", label: t("chat"), icon: ChatsCircle },
    { key: "mood", label: t("mood"), icon: Sparkle },
    { key: "members", label: t("people"), icon: UsersThree },
  ]
  const inThread = (tab === "chats" && activeChat) || (tab === "dms" && dmWith) || (tab === "mood" && spotRoom) || cityRoom

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative flex h-[var(--app-h)] flex-col">
      <ModeStrip token={token} me={me} />
      {!inThread && <TopBar me={me} onProfile={() => { setCloseSheets((x) => x + 1); setProfileOpen(true) }} />}
      <motion.div
        key={`${tab}-${cityRoom?.slug || ""}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {!cityRoom && tab === "trips" && <Trips token={token} me={me} unlockRequest={unlockRequest} closeSheets={closeSheets} postCity={postCity} onCityPosted={(c) => setViewCity(c)} onOpenDM={(m) => { setDmWith(m); setDmReturn("trips"); setTab("dms") }} onOpenPerson={setPersonNo} />}
        {!cityRoom && tab === "members" && (
          <Around
            key={peopleKey}
            token={token}
            me={me}
            viewCity={viewCity}
            onViewCity={setViewCity}
            onOpenDM={(m) => { setDmWith(m); setDmReturn("members"); setTab("dms") }}
            onOpenPerson={setPersonNo}
            onOpenWorld={() => setWorldOpen(true)}
            onOpenTonight={() => setTab("mood")}
            onUnlock={() => { setTab("trips"); setUnlockRequest(Date.now()) }}
            onNeedDates={(c) => { setTab("trips"); setPostCity(c) }}
          />
        )}
        {cityRoom && (
          <Thread
            token={token}
            me={me}
            channel={cityRoom.slug}
            title={`${cityRoom.emoji}  ${cityRoom.name} ${t("chat")}`}
            photoMap={photoMap}
            onOpenPerson={setPersonNo}
            onNeedDates={(c) => { setCityRoom(null); setTab("trips"); setPostCity(c) }}
            onBack={() => setCityRoom(null)}
          />
        )}
        {!cityRoom && tab === "mood" && !spotRoom && <Mood token={token} me={me} onOpenRoom={setSpotRoom} />}
        {!cityRoom && tab === "mood" && spotRoom && (
          <Thread
            token={token}
            me={me}
            channel={spotRoom.channel}
            title={spotRoom.title}
            photoMap={photoMap}
            onOpenPerson={setPersonNo}
            onBack={() => setSpotRoom(null)}
          />
        )}
        {!cityRoom && tab === "dms" && <DMScreen token={token} me={me} openWith={dmWith} setOpenWith={(v) => {
          setDmWith(v)
          // back out of a thread opened from "say hi": return to that screen
          if (v === null && dmReturn) { setTab(dmReturn); setDmReturn(null) }
        }} photoMap={photoMap} onOpenPerson={setPersonNo} onOpenWorld={() => setWorldOpen(true)} onNeedDates={(city) => { setTab("trips"); setPostCity(city) }} onPaywall={(r) => { if (r === "unlock") { setTab("trips"); setUnlockRequest(Date.now()) } else setPaywall(r) }} />}
      </motion.div>
      <AnimatePresence>
        {profileOpen && (
          <ProfileSheet
            token={token}
            me={me}
            onPhoto={(photo) => { setMe((m) => ({ ...m, photo })); setProfileOpen(false) }}
            onSafety={(patch) => setMe((m) => ({ ...m, ...patch }))}
            onVibes={() => { setProfileOpen(false); setVibesOpen(true) }}
            onClose={() => setProfileOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {worldOpen && (
          <World
            token={token}
            onClose={() => setWorldOpen(false)}
            onBrowse={(slug) => { setWorldOpen(false); setViewCity(slug); setTab("members") }}
            onOpenRoom={(c) => { setWorldOpen(false); setCityRoom(c) }}
            onPaywall={() => { setWorldOpen(false); setPaywall("city") }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {personNo && (
          <PersonSheet
            token={token}
            memberNo={personNo}
            onClose={() => setPersonNo(null)}
            onMessage={(p) => { setPersonNo(null); setDmWith({ memberNo: p.memberNo, name: p.name || p.first, ig: p.ig, photo: p.photo }); setDmReturn(tab); setTab("dms") }}
            onUnlock={() => { setPersonNo(null); setTab("trips"); setUnlockRequest(Date.now()) }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {nameOpen && (
          <NameSheet
            token={token}
            me={me}
            onClose={closeName}
            onSaved={(name) => { setMe((m) => ({ ...m, name, needsName: false })); closeName() }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {vibesOpen && !nameOpen && (
          <VibesSheet
            token={token}
            me={me}
            onClose={closeVibes}
            onSaved={(interests) => {
              setMe((m) => ({ ...m, interests }))
              closeVibes()
              setTab("members") // the payoff: people ranked by what you just picked
              setPeopleKey((k) => k + 1)
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {paywall && <PaywallSheet token={token} city={me.city} reason={paywall} onClose={() => setPaywall(null)} />}
      </AnimatePresence>
      {!inThread && (
        <nav className="sticky bottom-0 z-10 flex border-t-2 border-line/70 bg-cream/95 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
          {TABS.map((tb) => (
            <button key={tb.key} onClick={() => { setTab(tb.key); setSpotRoom(null); setCityRoom(null); setDmReturn(null); if (tb.key !== "chats") setActiveChat(null); if (tb.key !== "dms") setDmWith(null) }} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="relative flex h-9 w-14 items-center justify-center rounded-full">
                {tab === tb.key && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-full bg-lime shadow-[0_4px_12px_-4px_rgba(120,90,200,0.55)]"
                  />
                )}
                <tb.icon size={22} weight={tab === tb.key ? "fill" : "regular"} className={`relative ${tab === tb.key ? "text-ink" : "text-ink-soft/60"}`} />
                {tb.key === "dms" && unreadTotal > 0 && (
                  <span className="absolute right-2.5 top-1 h-2.5 w-2.5 rounded-full bg-[#c4453d]" />
                )}
              </span>
              <span className={`text-[10px] font-bold ${tab === tb.key ? "text-ink" : "text-ink-soft/60"}`}>{tb.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
    </MotionConfig>
  )
}
