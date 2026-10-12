import { useEffect, useRef, useState, useCallback, useContext } from "react"
import { SpotLink } from "../lib/spotlink"
import { MoreList } from "../lib/more"
import { cachedJson, prefetch } from "../lib/cached"
import { motion, AnimatePresence, MotionConfig, useDragControls } from "framer-motion"
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
import WhatsNew, { WHATS_NEW } from "../components/WhatsNew"
import { MessageMenu, SwipeToReply, hiddenMsgs, hideMsg, hiddenChats, hideChat, useStickToBottom } from "../components/MessageMenu"
import RideCard from "../components/RideCard"
import TonightPin from "../components/TonightPin"
import NightPrompt from "../components/NightPrompt"
import PushPrompt from "../components/PushPrompt"
import InstallSheet from "../components/InstallSheet"
import { registerSW, askPush } from "../lib/push"
import { isSeen, markSeen, useNew, NewDot } from "../lib/newdot"
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
        <p className="text-[12px] text-ink-soft font-semibold">{t("how was it?")}</p>
        <h3 className="display mt-1 text-[20px] font-bold leading-snug">{actEmojiOf(activity)} {activity.title}</h3>
        <p className="mt-0.5 tabular-nums text-[11px] text-ink-soft">{t("by")} {activity.creator.name.toLowerCase()}</p>
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

        <button onClick={report} className="mt-2 w-full py-2 text-[12px] text-[#b3461f]/80 font-semibold">
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
      <div className="mt-4 flex items-center gap-2 rounded-[1.5rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-4 py-3">
        <CheckCircle size={20} weight="fill" />
        <p className="text-[13.5px] font-bold">{t("instagram verified")}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-[1.5rem] border border-line bg-white/70 p-4">
      <p className="text-[12px] text-ink-soft font-semibold">{t("verify your instagram")}</p>
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
        className={`mt-2.5 flex w-full items-center justify-between rounded-[1rem] border px-3 py-2.5 text-left ${copied ? "border-transparent bg-ink text-cream" : "border-line bg-cream"}`}
      >
        <code className="text-[15px] font-bold tracking-wide">{code || "…"}</code>
        <span className="text-[12px] font-bold">{copied ? t("copied ✓") : t("tap to copy")}</span>
      </button>
      <a
        href="https://www.instagram.com/accounts/edit/"
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex w-full items-center justify-center rounded-full border border-line bg-white py-2.5 text-[13.5px] font-bold"
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

function ProfileSheet({ token, me, onPhoto, onSafety, onVibes, onOpenProfile, onHost, onClose, profileNew }) {
  const drag = useDragControls()
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
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        // drag down to close: grabbed from the top of the sheet (or anywhere
        // while it's scrolled to the top), so it never fights the scroll
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(e, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
        onPointerDown={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          if (e.clientY - box.top < 110 || e.currentTarget.scrollTop <= 0) drag.start(e)
        }}
        className="max-h-[92%] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-cream px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="-mx-6 flex cursor-grab touch-none justify-center pb-2 pt-1 active:cursor-grabbing">
          <div className="h-1.5 w-11 rounded-full bg-line" />
        </div>
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
        <button
          onClick={onOpenProfile}
          className="mt-5 flex w-full items-center justify-between rounded-[1.3rem] border border-line bg-white px-4 py-3 text-left active:scale-[0.99]"
        >
          <span>
            <span className="flex items-center gap-1.5 text-[14.5px] font-bold">
              {t("your profile & connections")}
              {profileNew && <span className="rounded-full bg-[#8a5cf0] px-1.5 py-0.5 text-[12px] text-white font-semibold">{t("new")}</span>}
            </span>
            <span className="block text-[12px] text-ink-soft">{t("stamps, people you've met, what others see")}</span>
          </span>
          <span className="text-[20px]">🛂</span>
        </button>
        <button onClick={onHost} className="mt-2 flex w-full items-center justify-between rounded-[1.3rem] border border-line bg-white/70 px-4 py-3 text-left active:scale-[0.99]">
          <span className="text-[14px] font-bold">{t("want to host a night?")}</span>
          <span className="text-[18px]">🏠</span>
        </button>
        <label className={`mt-3 flex w-full cursor-pointer items-center justify-center rounded-full bg-lime px-6 py-3.5 text-[14.5px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)] ${busy ? "opacity-60" : ""}`}>
          {busy ? t("uploading…") : me.photo ? t("change your photo") : t("add your photo")}
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
        </label>
        {error && <p className="mt-2.5 text-center text-[12.5px] font-medium text-[#b3461f]">{error}</p>}
        <p className="mt-3 text-center text-[12px] text-ink-soft/70 font-semibold">
          {t("your face shows next to your dates")}
        </p>

        {qr && (
          <div className="mt-5 flex items-center gap-4 rounded-2xl border border-line bg-white/70 p-4">
            <img src={qr} alt="log in on another device" className="h-24 w-24 rounded-lg" />
            <div>
              <p className="text-[13.5px] font-semibold leading-snug">{t("log in on your phone")}</p>
              <p className="mt-1 tabular-nums text-[10.5px] leading-relaxed text-ink-soft">
                {t("scan with your camera. it opens the club, logged in as you.")}
              </p>
            </div>
          </div>
        )}

        

        <button
          onClick={onVibes}
          className="mt-4 flex w-full items-center justify-between rounded-[1.5rem] border border-line bg-white/70 px-4 py-3.5 text-left"
        >
          <span className="text-[14px] font-bold">{t("your vibes")}</span>
          <span className="truncate pl-3 text-[12.5px] font-semibold text-ink-soft">
            {(me.interests || []).length ? (me.interests || []).slice(0, 3).map(vibeLabel).join(", ") : t("pick yours")}
          </span>
        </button>

        {modOn(me) && (
          <a
            href={`/?screen=ops&t=${token}`}
            className="mt-4 flex items-center justify-between rounded-[1.5rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-4 py-3.5"
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
        <div className="mt-4 rounded-[1.5rem] border border-line bg-white/70 p-4">
          <p className="text-[12px] text-ink-soft font-semibold">{t("who can message you")}</p>
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
          <label className="mt-2 flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">{t("show my photo")}</span>
            <button
              onClick={() => saveSafety({ hidePhoto: !me.hidePhoto })}
              className={`relative h-6 w-11 rounded-full transition-colors ${!me.hidePhoto ? "bg-lime-deep" : "bg-line"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${!me.hidePhoto ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
          <p className="mt-2 text-[12px] text-ink-soft">{t("off means only women and non-binary members can start a chat with you.")}</p>
          <p className="mt-1 text-[12px] text-ink-soft">{t("your photo shows to people with dates in your city. off keeps it blurred until you talk.")}</p>
        </div>

        {reviewOf && <ReviewSheet token={token} activity={reviewOf} onClose={() => setReviewOf(null)} />}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              try { localStorage.removeItem("irlpass_member_token") } catch { /* private mode */ }
              window.location.href = "/"
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line py-3 text-[13px] font-bold text-ink-soft"
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
            className="flex-1 rounded-full border border-line py-3 text-[13px] font-bold text-[#8f2b2b]"
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
            className="mt-2 w-full rounded-full border border-line py-3 text-[12.5px] font-bold text-ink-soft"
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
function TopBar({ me, onProfile, dot }) {
  return (
    <header className={`sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-cream/95 px-5 pb-3 backdrop-blur ${me?.isMod ? "pt-3" : "pt-[max(1rem,env(safe-area-inset-top))] md:pt-12"}`}>
      <Logo h="h-9" />
      <button
        onClick={onProfile}
        className="flex items-center gap-2 rounded-full border border-line bg-cream-deep/70 py-1 pl-1 pr-3 text-[12px] font-medium text-ink-soft active:scale-95"
      >
        <span className="relative">
          <Avatar member={me} photo={me.photo} size="h-6 w-6 text-[11px]" />
          {dot && <NewDot className="-right-0.5 -top-0.5" />}
        </span>
        nº {me.memberNo}
      </button>
    </header>
  )
}

/* ---------- map ---------- */
// the one paywall. the monthly plan starts with a free month (card down,
// $29 after unless they cancel). "next" says what happens when they come back:
// deliver the message they wrote, or buy the ride. a code (ride buyers, hosts,
// promos) skips the card entirely. $19.99/mo after the free month, or $89/yr.
function PaywallSheet({ token, me, city, reason = "city", next = "", draft = "", onUnlocked, onClose }) {
  const cityName = cityChip(city || "medellin").name.toLowerCase()
  const lines =
    reason === "deliver"
      ? { kicker: t("your message is ready"), head: t("start your free month to deliver it"), sub: draft ? `“${draft.slice(0, 120)}”` : "" }
      : reason === "invite"
        ? { kicker: t("your plan is ready"), head: t("start your free month to send it"), sub: draft ? `“${draft}”` : "" }
      : reason === "shuffle"
        ? { kicker: t("right now"), head: t("unlimited picks, every city"), sub: t("start your free month and shuffle as much as you want, wherever you are.") }
      : reason === "day"
        ? { kicker: t("my day"), head: t("plan every day of the trip"), sub: t("start your free month and plan as many days as you want, wherever you are.") }
      : reason === "member"
        ? { kicker: t("members only"), head: t("the guaranteed ride is for members"), sub: t("start your free month, then grab a seat.") }
        : reason === "dm"
          ? { kicker: t("irlpass pass"), head: t("message anyone, anywhere"), sub: t("start your free month and say hi to anyone on your dates.") }
          : { kicker: t("irlpass pass"), head: `${t("unlock")} ${cityName}`, sub: t("browse every city free. join the plans with a pass.") }
  // count each time this shows (ops: paywall views vs payers)
  useEffect(() => {
    fetch("/api/paywall", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, reason }) }).catch(() => {})
  }, [token, reason])
  const [busy, setBusy] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState("")
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)
  const go = async (plan = "monthly") => {
    setBusy(true)
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, plan, inApp: true, next }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.url) window.location.href = r.url
    else { setBusy(false); setErr(t("checkout isn't available right now")) }
  }
  const redeem = async () => {
    setBusy(true)
    setErr("")
    const r = await fetch("/api/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, code }),
    }).then((x) => x.json()).catch(() => null)
    setBusy(false)
    if (r?.ok) onUnlocked?.(next)
    else setErr(r?.error || t("that code didn't work"))
  }
  const invite = `https://irlpass.xyz/?ref=${me?.memberNo || ""}`
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "irlpass", text: t("join me on irlpass. we both get a free month."), url: invite })
      else { await navigator.clipboard.writeText(invite); setCopied(true) }
    } catch { /* dismissed */ }
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
        className="max-h-[92dvh] w-full max-w-[440px] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-line bg-cream p-6 pb-[max(2rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p className="flex items-center gap-1.5 text-[12px] text-lime-deep font-semibold">
          <Sparkle size={12} weight="fill" /> {lines.kicker}
        </p>
        <h3 className="display mt-1.5 text-[26px] font-bold leading-tight">{lines.head}</h3>
        {lines.sub && <p className="mt-1.5 text-[14px] italic leading-relaxed text-ink-soft">{lines.sub}</p>}
        <ul className="mt-4 space-y-2 text-[13.5px]">
          {[t("message anyone whose dates overlap yours"), t("every city, every window"), t("members-only rides and nights")].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-0.5 text-lime-deep">✦</span> {f}
            </li>
          ))}
        </ul>
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => go("monthly")} disabled={busy} className="mt-5 w-full rounded-full bg-ink py-4 text-center text-cream shadow-[0_12px_28px_-12px_rgba(58,50,44,0.7)] disabled:opacity-60">
          <span className="block text-[15.5px] font-bold">{busy ? t("one sec…") : t("start your free month")}</span>
          <span className="block tabular-nums text-[10px] text-cream/60">{t("then $19.99/mo · cancel anytime")}</span>
        </motion.button>
        <button onClick={() => go("yearly")} disabled={busy} className="mt-2 w-full py-1.5 text-[12.5px] font-semibold text-ink-soft">
          {t("or $89 for the year")}
        </button>

        {codeOpen ? (
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && redeem()}
              name="promo-code"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              autoFocus
              placeholder="RIDE-XXXXXX"
              className="w-full rounded-full border border-line bg-white px-4 py-2.5 text-[14px] font-bold outline-none focus:border-ink"
            />
            <button onClick={redeem} disabled={busy || !code.trim()} className="shrink-0 rounded-full bg-lime px-4 text-[13px] font-bold disabled:opacity-50">{t("use")}</button>
          </div>
        ) : (
          <button onClick={() => setCodeOpen(true)} className="mt-3 w-full py-1.5 text-[13px] font-bold text-ink-soft underline underline-offset-2">{t("have a code?")}</button>
        )}
        {err && <p className="mt-2 text-center text-[12.5px] font-semibold text-[#b3461f]">{err}</p>}

        <button onClick={share} className="mt-3 flex w-full items-center justify-between rounded-[1.2rem] border border-line px-4 py-3 text-left">
          <span>
            <span className="block text-[13.5px] font-bold">🎁 {t("invite a friend, you both get a free month")}</span>
            <span className="block text-[11.5px] text-ink-soft">{t("once you're both on the monthly plan")}</span>
          </span>
          <span className="shrink-0 text-[12px] font-bold text-ink-soft">{copied ? t("copied") : t("share")}</span>
        </button>
        <button onClick={onClose} className="mt-2 w-full py-2 text-[12px] text-ink-soft font-semibold">
          {reason === "deliver" ? t("keep it as a draft") : t("keep browsing free")}
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
        <span className="rounded-full bg-cream-deep px-1.5 py-0.5 tabular-nums text-[9.5px] font-semibold text-ink-soft">
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
          <p className="text-[12px] text-ink-soft font-semibold">
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
              <button onClick={save} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-cream">{t("save")}</button>
            </div>
          ) : (
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink">
              {act.details || (isCreator ? t("no details yet") : "")}
              {isCreator && (
                <button onClick={() => { setText(act.details || ""); setEditing(true) }} className="ml-2 text-[12px] font-semibold text-lime-deep underline underline-offset-2">
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
  if (today) return time
  // past the last 6 days a weekday alone reads as this week, so show the date
  const recent = Date.now() - d.getTime() < 6 * 864e5
  const day = recent
    ? d.toLocaleDateString([], { weekday: "short" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" })
  return `${day.toLowerCase()} ${time}`
}

// tap or long-press a bubble to open its action bar. a long press doesn't also
// fire the tap, and the bubble css turns off the ios copy/lookup callout.
function useLongPress(onOpen, ms = 420, onTap = null) {
  const timer = useRef(null)
  const fired = useRef(false)
  return (m) => ({
    onPointerDown: () => {
      fired.current = false
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(10); onOpen(m) }, ms)
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerCancel: () => clearTimeout(timer.current),
    onContextMenu: (e) => e.preventDefault(),
    onClick: (e) => {
      e.stopPropagation()
      if (fired.current) { fired.current = false; return }
      ;(onTap || onOpen)(m)
    },
  })
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

// chat text: links you can tap, @people in bold, @[spot](s12) as a spot chip.
// a spot tag is a door into the room: it opens that spot's board.
const RICH = /(https?:\/\/[^\s]+|(?:www\.)?irlpass\.xyz\/?[^\s]*|@\[[^\]]{1,60}\]\(s\d+\)|@[\w.]{2,30})/g
function WithMentions({ text }) {
  const openSpot = useContext(SpotLink)
  return String(text).split(RICH).map((part, i) => {
    if (!part) return null
    const spot = part.match(/^@\[([^\]]+)\]\(s(\d+)\)$/)
    if (spot) {
      return (
        <button
          key={i}
          onClick={(e) => { e.stopPropagation(); openSpot(Number(spot[2])) }}
          className="mx-0.5 inline-flex items-center gap-0.5 rounded-full bg-ink px-2 py-[1px] align-baseline text-[13px] font-bold text-cream"
        >
          📍 {spot[1]}
        </button>
      )
    }
    if (/^(https?:\/\/|(www\.)?irlpass\.xyz)/.test(part)) {
      const trail = part.match(/[).,!?]+$/)?.[0] || ""
      const url = part.slice(0, part.length - trail.length)
      const href = /^https?:/.test(url) ? url : `https://${url}`
      const ours = /^https?:\/\/(www\.)?irlpass\.xyz/.test(href)
      return (
        <span key={i}>
          <a
            href={href}
            target={ours ? "_self" : "_blank"}
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="break-all font-semibold underline underline-offset-2"
          >
            {url.replace(/^https?:\/\//, "")}
          </a>
          {trail}
        </span>
      )
    }
    if (part.startsWith("@")) return <span key={i} className="font-bold">{part}</span>
    return part
  })
}

// type @ and the guide's spots pop up, like tagging a person. the tag becomes
// @[name](s12) in the message, which renders as a tappable spot chip.
let spotCache = null
function SpotSuggest({ token, text, setText }) {
  const [spots, setSpots] = useState(spotCache || [])
  const q = (text.match(/@([^\s@\[]*)$/) || [])[1]
  useEffect(() => {
    if (q === undefined || spotCache) return
    fetch(`/api/mood?t=${token}&city=medellin`)
      .then((r) => r.json())
      .then((d) => {
        const all = Object.values(d.board || {}).flat()
        spotCache = [...new Map(all.map((x) => [x.id, { id: x.id, name: x.name, area: x.area, going: x.going }])).values()]
        setSpots(spotCache)
      })
      .catch(() => {})
  }, [q, token])
  if (q === undefined) return null
  const norm = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const hits = spots
    .filter((x) => !q || norm(x.name).includes(norm(q)))
    .sort((a, b) => b.going - a.going)
    .slice(0, 6)
  if (!hits.length) return null
  return (
    <div className="mb-2 flex gap-1.5 overflow-x-auto">
      {hits.map((x) => (
        <button
          key={x.id}
          onClick={() => setText((v) => v.replace(/@([^\s@\[]*)$/, `@[${x.name.replace(/[\[\]()]/g, "")}](s${x.id}) `))}
          className="shrink-0 rounded-full bg-ink px-3 py-1 text-[12.5px] font-bold text-cream"
        >
          📍 {x.name}{x.going ? ` · ${x.going}` : ""}
        </button>
      ))}
    </div>
  )
}

function Thread({ token, me, channel, title, activity, onBack, photoMap = {}, onNeedDates, onSeen, onOpenPerson, onBuyRide, onPaywall }) {
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
  const [hiddenRoom, setHiddenRoom] = useState(() => hiddenMsgs()) // "delete for me"
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

  const msgs = server === null ? null : [...server, ...pending].filter((m) => !hiddenRoom.has(String(m.key)))

  const stick = useStickToBottom(msgs?.length || 0, !!msgs?.length && msgs[msgs.length - 1].from?.memberNo === me.memberNo)

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
        if (body.action === "send") setText(body.text)
        return
      }
      if (d?.gate === "deliver" && body.action === "send") {
        // keep what they wrote: it posts itself once they're in
        setPending([])
        setText(body.text)
        try { localStorage.setItem("irl:pending-room", JSON.stringify({ channel, text: body.text, title })) } catch { /* private mode */ }
        onPaywall?.({ reason: "deliver", next: `room-${channel}`, draft: body.text })
        return
      }
      if (!r.ok && body.action === "send") {
        // didn't post: take the bubble back, give them their text and the reason
        setPending([])
        setText(body.text)
        setSendErr(d?.error || t("that didn't send. try again"))
        return
      }
      setSendErr("")
      pollRef.current()
    } catch {
      if (body.action === "send") { setPending([]); setText(body.text); setSendErr(t("you're offline. try again")) }
    }
  }
  const [sendErr, setSendErr] = useState("")

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

  const [menu, setMenu] = useState(null) // whatsapp-style long-press sheet
  const pressFor = useLongPress((m) => !m.deleted && !String(m.key).startsWith("local-") && setMenu(m))

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
    const same = r?.from === LANG || (r?.text || "").trim().toLowerCase() === m.text.trim().toLowerCase()
    setTranslated((x) => ({ ...x, [m.key]: same ? "same" : r?.text || "error" }))
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
          <p className="text-[12px] text-ink-soft font-semibold">
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
      {channel === "medellin" && <TonightPin token={token} />}
      {channel === "medellin" && (
        <div className="flex items-start gap-2.5 border-b border-line/70 bg-cream-deep/50 px-4 py-2.5">
          <PushPin size={14} weight="fill" className="mt-0.5 shrink-0 text-ink-soft" />
          <div>
            <p className="text-[12px] font-semibold text-ink-soft/70">{t("pinned")}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink">{t("say hi, say where you're at, find someone to go with.")}</p>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
      <stick.Pill />
      <div ref={stick.box} onScroll={stick.onScroll} className="flex flex-1 flex-col overflow-y-auto px-4 py-4" onClick={() => setFocused(null)}>
        {/* mt-auto pins the conversation to the bottom, like every messenger */}
        <div className="mt-auto space-y-3">
          {!msgs ? (
            <div className="flex justify-center pb-8"><CircleNotch size={20} className="animate-spin text-ink-soft" /></div>
          ) : msgs.length === 0 ? (
            <p className="pb-8 text-center tabular-nums text-[11px] text-ink-soft">{t("no messages yet. say something.")}</p>
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
                  <span className="text-[12px] text-ink-soft font-semibold">{chatDay(m.at)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )

              if (system) {
                return (
                  <div key={m.key} className="flex justify-center">
                    <p className="max-w-[85%] rounded-full bg-cream-deep/80 px-4 py-1.5 text-center tabular-nums text-[10.5px] leading-relaxed text-ink-soft">
                      <WithMentions text={m.text} />
                    </p>
                  </div>
                )
              }

              return (
                <div key={m.key} className={first ? "pt-2" : "-mt-2"}>
                {dayLine}
                <SwipeToReply onReply={() => { if (!m.deleted && !String(m.key).startsWith("local-")) { setReplyTo(m); setEditing(null); document.getElementById("room-composer")?.focus() } }}>
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
                      {...pressFor(m)}
                      className={`bubble min-w-0 max-w-full break-words px-3.5 py-2 [overflow-wrap:anywhere] ${
                        m.deleted
                          ? "rounded-[1.2rem] border border-line bg-transparent"
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
                          <span className="font-semibold"><span className="out-dot mr-1.5 inline-block h-2 w-2 rounded-full bg-[#5fd35f] align-middle" /><WithMentions text={m.text.slice(2)} /></span>
                        ) : <WithMentions text={m.text} />}
                        {m.edited && !m.deleted && <span className="ml-1.5 tabular-nums text-[9px] text-ink/45">{t("(edited)")}</span>}
                        {mine && !m.deleted && <span className="ml-1.5 whitespace-nowrap tabular-nums text-[9px] text-ink/45">{msgTime(m.at)}</span>}
                      </p>
                      {translated[m.key] && translated[m.key] !== "same" && !m.deleted && (
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
                        className="mt-0.5 px-1 text-[12px] font-semibold text-ink-soft"
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

                  </div>
                </div>
                </SwipeToReply>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      </div>
        <AnimatePresence>
          {menu && (
            <MessageMenu
              m={menu}
              mine={menu.from.memberNo === me.memberNo}
              onReact={(em) => react(menu, em)}
              onReply={() => { setReplyTo(menu); setEditing(null); document.getElementById("room-composer")?.focus() }}
              onCopy={() => navigator.clipboard?.writeText(menu.text).catch(() => {})}
              onTranslate={menu.from.memberNo !== me.memberNo ? () => translate(menu) : null}
              translated={!!translated[menu.key] && translated[menu.key] !== "error"}
              onEdit={() => { setEditing(menu); setReplyTo(null); setText(menu.text); document.getElementById("room-composer")?.focus() }}
              onDeleteAll={() => remove(menu)}
              onDeleteMe={() => { hideMsg(menu.key); setHiddenRoom(hiddenMsgs()) }}
              onClose={() => setMenu(null)}
            />
          )}
        </AnimatePresence>

        {needsDates && (
          <button
            onClick={() => onNeedDates?.(channel)}
            className="mx-3 mb-2 flex items-center gap-3 rounded-[1.4rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-4 py-3 text-left"
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
                <p className="truncate tabular-nums text-[10.5px] text-ink-soft">
                  {editing ? t("editing your message") : `${t("replying to")} ${replyTo.from.name.toLowerCase()}: ${replyTo.text.slice(0, 50)}`}
                </p>
                <button
                  onClick={() => { setReplyTo(null); setEditing(null); setText("") }}
                  className="ml-2 text-[12px] text-ink-soft font-semibold"
                >
                  {t("cancel")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {sendErr && <p className="mb-2 text-center text-[12px] font-semibold text-[#b3461f]">{sendErr}</p>}
        {(channel === "medellin" || channel.startsWith("spot-")) && <SpotSuggest token={token} text={text} setText={setText} />}
        {mentionPool.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto">
            {mentionPool.map((f) => (
              <button
                key={f.memberNo}
                onClick={() => setText((x) => x.replace(/@([\w.]*)$/, `@${mentionTag(f)} `))}
                className="shrink-0 rounded-full border border-line bg-white/80 px-3 py-1 text-[12.5px] font-bold"
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
        <p className="mt-3 tabular-nums text-[11px] text-ink-soft">{t("if that email is in our system, a login link is on its way.")}</p>
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
      <a href="/" className="mt-4 text-[12px] text-ink-soft underline underline-offset-2 font-semibold">
        {t("or join on the homepage")}
      </a>
    </div>
  )
}

/* ---------- direct messages ---------- */
// free to dm anyone you've shared a plan with; reaching strangers needs a pass.
function DMScreen({ token, me, openWith, setOpenWith, onPaywall, photoMap = {}, onNeedDates, onOpenPerson, onOpenWorld, onBuyRide, onOpenRoom }) {
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
              // every other city's room goes in one collapsed "moderate" row, not the main list
              const own = new Set(cities.length ? cities : [me.city || "medellin"])
              setModRooms(Object.keys(st.byCity || {}).filter((c) => !own.has(c)).sort((a, b) => (st.byCity[b] || 0) - (st.byCity[a] || 0)))
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  const [modRooms, setModRooms] = useState([])
  const [modOpen, setModOpen] = useState(false)
  const [threads, setThreads] = useState(null)
  const [convo, setConvo] = useState(null) // { with, messages }
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  // last inbox instantly, then fresh; on festival signal a failed load retries
  // instead of hanging on a spinner
  const loadInbox = useCallback(() => {
    let tries = 0
    const go = () =>
      cachedJson(`/api/dm?t=${token}`, (d) => setThreads(d.threads || [])).catch(() => {
        if (++tries < 4) setTimeout(go, 1500 * tries)
        else setThreads((x) => x || [])
      })
    go()
  }, [token])
  const [inboxQ, setInboxQ] = useState("")
  // long-press a conversation for "delete chat" (tap still opens it)
  const [chatMenu, setChatMenu] = useState(null)
  const [, bumpChats] = useState(0)
  const chatPress = useLongPress((th) => setChatMenu(th), 420, (th) => setOpenWith(th.with))

  const loadConvo = useCallback((no) => {
    return fetch(`/api/dm?t=${token}&with=${no}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setConvo((prev) => (d?.messages ? d : prev)))
      .catch(() => setConvo((prev) => prev || { with: null, messages: [], failed: true }))
  }, [token])

  useEffect(() => {
    if (openWith) { setConvo(null); loadConvo(openWith.memberNo) }
    else { setConvo(null); loadInbox() }
    // an open conversation stays live: replies show up without backing out
    if (!openWith) return
    const id = setInterval(() => loadConvo(openWith.memberNo), 3500)
    return () => clearInterval(id)
  }, [openWith, loadConvo, loadInbox])


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
    const same = r?.from === LANG || (r?.text || "").trim().toLowerCase() === m.text.trim().toLowerCase()
    setDmTranslated((x) => ({ ...x, [m.key]: same ? "same" : r?.text || "error" }))
  }

  // the same action bar as the group chat: react, reply, translate, edit, delete.
  // tap a bubble or long-press it (long-press is what people try first on a phone)
  const [dmMenu, setDmMenu] = useState(null) // the message whose long-press menu is open
  const setDmFocused = () => setDmMenu(null)
  const [dmReply, setDmReply] = useState(null)
  const [dmEditing, setDmEditing] = useState(null)
  const pressFor = useLongPress((m) => !m.deleted && setDmMenu(m))
  // sent-but-not-confirmed bubbles show right away (🕓), failed ones offer a retry
  const [outbox, setOutbox] = useState([])
  // only jump to the bottom when a message actually arrives (and you're at the bottom)
  const convoLen = (convo?.messages?.length || 0) + outbox.length
  const dmStick = useStickToBottom(convoLen, outbox.length > 0 || !!convo?.messages?.[convo.messages.length - 1]?.fromMe)
  const [hidden, setHidden] = useState(() => hiddenMsgs())
  const chatHiddenAt = openWith ? hiddenChats()[openWith.memberNo] || "" : ""
  const shownMsgs = [
    ...(convo?.messages || []).filter((m) => !hidden.has(String(m.key)) && (!chatHiddenAt || m.at > chatHiddenAt)),
    ...outbox.filter((o) => o.to === openWith?.memberNo),
  ]

  const dmAct = async (m, action, extra = {}) => {
    setDmFocused(null)
    setConvo((c) => c && {
      ...c,
      messages: c.messages.map((x) => {
        if (x.key !== m.key) return x
        if (action === "delete") return { ...x, deleted: true, text: "" }
        if (action === "edit") return { ...x, text: extra.text, edited: true }
        const r = { ...x.reactions }
        const who = new Set(r[extra.emoji] || [])
        who.has(me.memberNo) ? who.delete(me.memberNo) : who.add(me.memberNo)
        if (who.size) r[extra.emoji] = [...who]
        else delete r[extra.emoji]
        return { ...x, reactions: r }
      }),
    })
    await fetch("/api/dm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, action, id: m.key, ...extra }),
    }).catch(() => {})
  }

  const send = async (override) => {
    const body = (typeof override === "string" ? override : text).trim()
    if (!body || !openWith) return
    if (dmEditing && typeof override !== "string") {
      const target = dmEditing
      setDmEditing(null)
      setText("")
      return dmAct(target, "edit", { text: body })
    }
    const reply = typeof override === "string" ? null : dmReply
    setDmReply(null)
    if (typeof override !== "string") setText("")
    // the bubble shows instantly; the server catches up
    const local = { key: `p-${Date.now()}`, to: openWith.memberNo, text: body, at: new Date().toISOString(), fromMe: true, pending: true, replyTo: reply?.key ?? null, reactions: {} }
    setOutbox((o) => [...o, local])
    const r = await fetch("/api/dm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, to: openWith.memberNo, text: body, replyTo: reply?.key ?? null }),
    }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) {
      if (r?.gate) setOutbox((o) => o.filter((x) => x.key !== local.key))
      else setOutbox((o) => o.map((x) => (x.key === local.key ? { ...x, failed: true } : x)))
      if (r?.gate && typeof override !== "string") setText(body)
    }
    if (r?.gate === "deliver") {
      // keep what they wrote: it sends itself once they're in
      try { localStorage.setItem("irl:pending-dm", JSON.stringify({ to: openWith.memberNo, text: body, replyTo: reply?.key ?? null, name: openWith.name, photo: openWith.photo })) } catch { /* private mode */ }
      return onPaywall({ reason: "deliver", next: `deliver-${openWith.memberNo}`, draft: body })
    }
    if (r?.gate === "dm" || r?.gate === "unlock") return onPaywall(r.gate)
    if (!r?.ok) return
    await loadConvo(openWith.memberNo)
    setOutbox((o) => o.filter((x) => x.key !== local.key))
    askPush(t("they reply"))
  }
  const retry = (m) => {
    setOutbox((o) => o.filter((x) => x.key !== m.key))
    setDmReply(m.replyTo ? convo?.messages?.find((x) => x.key === m.replyTo) || null : null)
    send(m.text)
  }

  // trust before meeting: one tap asks for a short video call first
  const askVideo = () =>
    send(t("📹 before we meet up, want to do a quick video call to say hi? send me a time that works."))

  // a single conversation
  if (openWith) {
    const other = convo?.with || openWith
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button onClick={() => setOpenWith(null)} className="text-ink-soft active:scale-90"><ArrowLeft size={20} /></button>
          {other.locked ? (
            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-cream-deep">
              {other.photo && <img src={other.photo} alt="" className="h-full w-full scale-110 object-cover blur-[2px]" />}
            </span>
          ) : (
            <Avatar member={other} photo={photoMap[other.memberNo]} size="h-9 w-9 text-[14px]" />
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[14.5px] font-semibold leading-tight">{(other.name || other.first || "").toLowerCase()} <RepBadge score={other.repScore} verified={other.verified} /></p>
            <p className="tabular-nums text-[10px] text-ink-soft">{other.ig}</p>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <dmStick.Pill />
        <div ref={dmStick.box} onScroll={dmStick.onScroll} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {!convo ? (
            <div className="flex flex-1 items-center justify-center"><CircleNotch size={20} className="animate-spin text-ink-soft" /></div>
          ) : shownMsgs.length === 0 ? (
            <p className="mt-6 text-center tabular-nums text-[11px] text-ink-soft">{t("say hi. you're in the same city on the same days.")}</p>
          ) : (
            shownMsgs.map((m, i) => {
              const prev = shownMsgs[i - 1]
              const quoted = m.replyTo ? convo.messages.find((x) => x.key === m.replyTo) : null
              const reactions = Object.entries(m.reactions || {})
              const tr = dmTranslated[m.key]
              const lastMine = m.fromMe && !shownMsgs.slice(i + 1).some((x) => x.fromMe)
              return (
                <div key={m.key} className="flex flex-col">
                  {(!prev || dayKey(prev.at) !== dayKey(m.at)) && (
                    <div className="flex items-center gap-3 py-2">
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-[12px] text-ink-soft font-semibold">{chatDay(m.at)}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <SwipeToReply
                    onReply={() => { if (!m.deleted && !m.pending) { setDmReply(m); setDmEditing(null); document.getElementById("dm-composer")?.focus() } }}
                    className={`flex max-w-[80%] flex-col ${m.fromMe ? "items-end self-end" : "items-start self-start"}`}
                  >
                  <div id={`dm-${m.key}`} className={`flex flex-col ${m.fromMe ? "items-end" : "items-start"}`}>
                    <div
                      {...(m.pending ? {} : pressFor(m))}
                      onClick={m.failed ? () => retry(m) : (m.pending ? undefined : pressFor(m).onClick)}
                      className={`bubble max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-snug [overflow-wrap:anywhere] ${
                        m.deleted ? "border border-line bg-transparent italic text-ink-soft/60" : m.fromMe ? `bg-lime text-ink ${m.pending && !m.failed ? "opacity-70" : ""}` : "bg-white text-ink shadow-[0_1px_2px_rgba(58,50,44,0.08)]"
                      }`}
                    >
                      {quoted && !m.deleted && (
                        <button
                          onClick={(e) => { e.stopPropagation(); document.getElementById(`dm-${quoted.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }) }}
                          className={`mb-1 w-full rounded-lg border-l-[3px] bg-ink/5 px-2 py-1 text-left text-[12px] leading-snug line-clamp-2 ${m.fromMe ? "border-ink/40 text-ink/70" : "border-lime-deep text-ink-soft"}`}
                        >
                          <span className="block font-bold">{quoted.fromMe ? t("you") : (other.name || other.first || "").split(" ")[0].toLowerCase()}</span>
                          {quoted.deleted ? t("deleted message") : quoted.text}
                        </button>
                      )}
                      {m.deleted ? t("message deleted") : <WithMentions text={m.text} />}
                      <span className="float-right ml-2 mt-1.5 flex items-center gap-1 whitespace-nowrap tabular-nums text-[9.5px] leading-none text-ink/45">
                        {m.edited && !m.deleted && t("edited")}
                        {m.failed ? <span className="font-bold text-[#b3461f]">{t("not sent · tap to retry")}</span> : msgTime(m.at)}
                        {m.fromMe && !m.deleted && !m.failed && (
                          m.pending ? <span>🕓</span> : <span className={m.read ? "font-bold text-[#5b8a2b]" : ""}>{m.read ? "✓✓" : "✓"}</span>
                        )}
                      </span>
                      {tr && tr !== "same" && !m.deleted && (
                        <p className="mt-1 clear-both border-t border-ink/10 pt-1 italic">
                          {tr === "loading" ? t("translating…") : tr === "error" ? t("couldn't translate that right now") : tr}
                        </p>
                      )}
                    </div>
                    {lastMine && m.read && <span className="mt-0.5 px-1 tabular-nums text-[9.5px] text-ink-soft">{t("seen")}</span>}
                    {!m.fromMe && !m.deleted && !tr && looksForeign(m.text) && (
                      <button onClick={() => translateDm(m)} className="mt-0.5 px-1 text-[12px] font-semibold text-ink-soft">
                        {t("translate")}
                      </button>
                    )}
                    {reactions.length > 0 && (
                      <div className={`-mt-1.5 flex gap-1 ${m.fromMe ? "mr-2 flex-row-reverse" : "ml-2"}`}>
                        {reactions.map(([em, who]) => (
                          <button
                            key={em}
                            onClick={() => dmAct(m, "react", { emoji: em })}
                            className={`rounded-full border bg-white px-1.5 py-0.5 text-[11px] shadow-sm ${who.includes(me.memberNo) ? "border-lime-deep" : "border-line"}`}
                          >
                            {em} {who.length > 1 ? who.length : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  </SwipeToReply>
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>
        </div>
        <AnimatePresence>
          {dmMenu && (
            <MessageMenu
              m={dmMenu}
              mine={dmMenu.fromMe}
              onReact={(em) => dmAct(dmMenu, "react", { emoji: em })}
              onReply={() => { setDmReply(dmMenu); setDmEditing(null); document.getElementById("dm-composer")?.focus() }}
              onCopy={() => navigator.clipboard?.writeText(dmMenu.text).catch(() => {})}
              onTranslate={!dmMenu.fromMe ? () => translateDm(dmMenu) : null}
              translated={!!dmTranslated[dmMenu.key] && dmTranslated[dmMenu.key] !== "error"}
              onEdit={() => { setDmEditing(dmMenu); setDmReply(null); setText(dmMenu.text); document.getElementById("dm-composer")?.focus() }}
              onDeleteAll={() => dmAct(dmMenu, "delete")}
              onDeleteMe={() => { hideMsg(dmMenu.key); setHidden(hiddenMsgs()) }}
              onClose={() => setDmMenu(null)}
            />
          )}
        </AnimatePresence>
        {convo && other.memberNo !== "002" && convo.messages.some((m) => m.fromMe) && convo.messages.some((m) => !m.fromMe) && !convo.messages.some((m) => m.text.startsWith("📹")) && (
          <button
            onClick={askVideo}
            disabled={busy}
            className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-full border border-line bg-white/70 py-2 text-[12.5px] font-bold text-ink-soft disabled:opacity-40"
          >
            📹 {t("ask for a quick video call first")}
          </button>
        )}
        <AnimatePresence>
          {(dmReply || dmEditing) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden px-3">
              <div className="mb-1 flex items-center justify-between rounded-xl border border-line bg-cream-deep/70 px-3 py-1.5">
                <p className="truncate tabular-nums text-[10.5px] text-ink-soft">
                  {dmEditing ? t("editing your message") : `${t("replying to")} ${dmReply.fromMe ? t("you") : (other.name || "").split(" ")[0].toLowerCase()}: ${dmReply.text.slice(0, 50)}`}
                </p>
                <button onClick={() => { setDmReply(null); setDmEditing(null); setText("") }} className="ml-2 text-[12px] text-ink-soft font-semibold">{t("cancel")}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {me.city === "medellin" && <div className="px-3 pt-2"><SpotSuggest token={token} text={text} setText={setText} /></div>}
        <div className="flex items-end gap-2 border-t border-line px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2.5">
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
        onBuyRide={onBuyRide}
        onOpenPerson={onOpenPerson}
        onNeedDates={onNeedDates}
        onSeen={(lastId) => markRoomSeen(roomCity, lastId)}
      />
    )
  }

  // the inbox
  return (
    <div className="px-5 pb-28 pt-4">
      <h2 className="display text-[30px] font-bold leading-none">{t("chat")}</h2>

      {/* groups: your city rooms + every city, one clean list */}
      <p className="mt-4 px-1 text-[12px] font-semibold text-ink-soft">{t("groups")}</p>
      <div className="mt-1.5 divide-y divide-line/60 overflow-hidden rounded-[1.25rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05)]">
        {rooms.map((c) => (
          <button
            key={c}
            onClick={() => { setRoomUnread((u) => ({ ...u, [c]: 0 })); onOpenRoom ? onOpenRoom({ slug: c, name: cityChip(c).name.toLowerCase(), emoji: cityChip(c).emoji }) : (setRoomCity(c), setRoomOpen(true)) }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-cream-deep/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[22px] leading-none" aria-hidden>{cityChip(c).emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-tight">{cityChip(c).name.toLowerCase()}</p>
              <p className="truncate text-[12.5px] text-ink-soft">{cityCounts[c] ? `${cityCounts[c]} ${t("here")}` : t("everyone in town right now")}</p>
            </div>
            {roomUnread[c] > 0 && <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-cream">{roomUnread[c]}</span>}
          </button>
        ))}
        <button onClick={onOpenWorld} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-cream-deep/40">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[20px]">🌍</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight">{t("every city")}</p>
            <p className="truncate text-[12.5px] text-ink-soft">{t("see where irlpass is right now and who's talking")}</p>
          </div>
        </button>
        {modRooms.length > 0 && (
          <div>
            <button onClick={() => setModOpen((x) => !x)} className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-cream-deep/40">
              <span className="text-[13.5px] font-semibold text-ink-soft">{t("moderate")} · {modRooms.length} {t("other city chats")}</span>
              <span className="text-[12px] text-ink-soft">{modOpen ? "▴" : "▾"}</span>
            </button>
            {modOpen && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                {modRooms.map((c) => (
                  <button
                    key={c}
                    onClick={() => onOpenRoom ? onOpenRoom({ slug: c, name: cityChip(c).name.toLowerCase(), emoji: cityChip(c).emoji }) : (setRoomCity(c), setRoomOpen(true))}
                    className="rounded-full bg-cream-deep/70 px-3 py-1.5 text-[12.5px] font-semibold active:scale-95"
                  >
                    {cityChip(c).emoji} {cityChip(c).name.toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-5 px-1 text-[12px] font-semibold text-ink-soft">{t("messages")}</p>
      {me.memberNo !== "002" && (
        <button
          onClick={() => setOpenWith({ memberNo: "002", name: "Josh", ig: "@jawshmac" })}
          className="mt-1.5 flex w-full items-center gap-3 rounded-[1.25rem] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(58,50,44,0.05)] active:bg-cream-deep/40"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[18px]">👋</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight">{t("josh · irlpass")}</p>
            <p className="truncate text-[12.5px] text-ink-soft">{t("stuck on something? he answers")}</p>
          </div>
        </button>
      )}

      {!threads ? (
        <div className="mt-10 flex justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
      ) : threads.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-line p-6 text-center">
          <p className="text-[15px] font-semibold">{t("no dms yet")}</p>
          <p className="mt-1 text-[13px] text-ink-soft">{t("say hi to someone on your dates and it lands here.")}</p>
        </div>
      ) : (
        <>
        {threads.length > 5 && (
          <input
            type="search"
            name="chat-search"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={inboxQ}
            onChange={(e) => setInboxQ(e.target.value)}
            placeholder={t("search chats")}
            className="mt-4 w-full rounded-full border border-line bg-white/80 px-4 py-2.5 text-[14px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50 focus:border-ink"
          />
        )}
        <div className="mt-2 divide-y divide-line/60 overflow-hidden rounded-[1.25rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05)]">
          <MoreList
            items={threads.filter((th) => !(hiddenChats()[th.with.memberNo] >= th.at)).filter((th) => !inboxQ.trim() || `${th.with.name} ${th.with.ig} ${th.last}`.toLowerCase().includes(inboxQ.trim().toLowerCase()))}
            step={15}
            resetKey={inboxQ}
            render={(th) => (
            <button key={th.with.memberNo} {...chatPress(th)} className="bubble flex w-full items-center gap-3 px-4 py-3 text-left active:bg-cream-deep/30">
              <Avatar member={th.with} photo={photoMap[th.with.memberNo]} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[14.5px] font-semibold leading-tight">{th.with.name.toLowerCase()} <RepBadge score={th.with.repScore} verified={th.with.verified} /></p>
                <p className="truncate tabular-nums text-[11px] text-ink-soft">{th.lastFromMe ? `${t("you")}: ` : ""}{th.last}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="tabular-nums text-[9.5px] text-ink-soft">{msgTime(th.at)}</span>
                {th.unread > 0 && <span className="rounded-full bg-lime px-2 py-0.5 tabular-nums text-[10px] font-semibold text-ink">{th.unread}</span>}
              </div>
            </button>
          )}
          />
        </div>
        </>
      )}
      <AnimatePresence>
        {chatMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setChatMenu(null)} className="fixed inset-0 z-[55] bg-ink/40 backdrop-blur-[2px]" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
              className="fixed inset-x-0 bottom-0 z-[56] mx-auto max-w-[460px] rounded-t-[1.75rem] bg-cream pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
              <p className="mt-3 px-5 text-[15px] font-bold">{chatMenu.with.name?.toLowerCase()}</p>
              <div className="mt-2 divide-y divide-line/60 border-t border-line/60">
                <button onClick={() => { setOpenWith(chatMenu.with); setChatMenu(null) }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-semibold">💬 {t("open chat")}</button>
                <button onClick={() => { hideChat(chatMenu.with.memberNo); setChatMenu(null); bumpChats((x) => x + 1) }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-semibold text-[#b3461f]">🗑 {t("delete chat")}</button>
                <button onClick={() => setChatMenu(null)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-semibold text-ink-soft">{t("cancel")}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- "yes, i want to host" ---------- */
function HostSheet({ token, onClose }) {
  const [d, setD] = useState(null)
  const [earn, setEarn] = useState(null)
  const [note, setNote] = useState("")
  const [sent, setSent] = useState(false)
  useEffect(() => {
    fetch(`/api/host?t=${token}`).then((r) => r.json()).then((x) => { setD(x); setEarn(x.mine?.earn_range || null); setNote(x.mine?.note || "") }).catch(() => setD({ ranges: [] }))
  }, [token])
  const save = async () => {
    const r = await fetch("/api/host", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, earn, note }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.ok) setSent(true)
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex items-end bg-ink/40" onClick={onClose}>
      <motion.div
        initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-[1.75rem] border-t border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        {sent ? (
          <>
            <h2 className="display text-[26px] font-bold leading-tight">{t("you're on the host list")}</h2>
            <p className="mt-1 text-[13.5px] text-ink-soft">{t("josh will message you about your first night.")}</p>
            <button onClick={onClose} className="mt-4 w-full rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream">{t("done")}</button>
          </>
        ) : (
          <>
            <h2 className="display text-[26px] font-bold leading-tight">{t("want to host a night?")}</h2>
            <p className="mt-1 text-[13.5px] text-ink-soft">{t("dinners, pregames, rides. what would you want to earn per night?")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(d?.ranges || []).map((r) => (
                <button key={r} onClick={() => setEarn(r)} className={`rounded-2xl border py-3 text-[14px] font-bold ${earn === r ? "border-transparent bg-ink text-cream" : "border-line bg-white/70"}`}>{r}</button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t("what would you host? (optional)")}
              className="mt-3 w-full resize-none rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-[14px] outline-none focus:border-ink"
            />
            <button onClick={save} disabled={!earn} className="mt-3 w-full rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream disabled:opacity-40">{t("yes, i want to host")}</button>
          </>
        )}
      </motion.div>
    </motion.div>
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
        className="w-full rounded-t-[1.75rem] border-t border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
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
          className="mt-4 w-full rounded-[1.4rem] border border-line bg-white/80 px-4 py-3.5 text-[17px] font-semibold outline-none focus:border-ink"
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
        className="max-h-[90%] w-full overflow-y-auto rounded-t-[1.75rem] border-t border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
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
                className={`flex aspect-[1/0.85] flex-col items-center justify-center gap-1 rounded-[1.2rem] border px-1 text-center ${on ? "border-transparent bg-ink text-cream" : "border-line bg-white/70"}`}
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
      className={`flex w-full items-center justify-between gap-2 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-left ${ member ? "bg-peach text-ink" : "bg-ink text-cream" }`}
    >
      <span className="min-w-0">
        <span className="block text-[12px] font-bold">
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
  const [focusSpot, setFocusSpot] = useState(null) // a tapped @spot: open its board on the mood tab
  // josh: every tab funnels into the mood tab. "make a plan with sofia" opens
  // the board (on her spot if she's out somewhere), you pick the spot and night,
  // a group chat forms, and she gets asked along.
  const [planWith, setPlanWith] = useState(null) // { memberNo, first, photo, nights }
  const makePlan = (p, nights = null, city = null) => {
    // plan boards only exist where we have a guide (medellín for now). anywhere
    // else, a plan starts as a conversation instead of a medellín bar list.
    if (city && city !== "medellin") {
      setPersonNo(null)
      setDmWith({ memberNo: p.memberNo, name: p.name || p.first, photo: p.photo || null })
      setDmReturn(tab)
      setTab("dms")
      return
    }
    setPersonNo(null)
    setDmWith(null)
    setCityRoom(null)
    setSpotRoom(null)
    setPlanWith({ memberNo: p.memberNo, first: p.first || String(p.name || "").split(/\s+/)[0], photo: p.photo || null, nights })
    if (p.out?.spotId) setFocusSpot(p.out.spotId)
    setTab("mood")
  }
  const [dmReturn, setDmReturn] = useState(null) // the tab "say hi" was tapped on, so back goes there
  const [personNo, setPersonNo] = useState(null) // whose profile is open
  const [hostOpen, setHostOpen] = useState(false)
  const [pushUp, setPushUp] = useState(false)
  useEffect(() => { const on = (e) => setPushUp(!!e.detail); window.addEventListener("irl:prompt", on); return () => window.removeEventListener("irl:prompt", on) }, [])
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

  // after an update: a one-time "what's new" sheet, and dots on what changed
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [moodNew, clearMoodNew] = useNew("mood-search")
  const [profileNew, clearProfileNew] = useNew("connections")
  useEffect(() => {
    if (state !== "ok" || !me || nameOpen || vibesOpen || isSeen(WHATS_NEW)) return
    // never on top of something they came for (a push deep link, a sheet, a chat)
    if (paywall || personNo || profileOpen || worldOpen || focusSpot || dmWith || cityRoom || spotRoom || new URLSearchParams(window.location.search).get("go")) return
    // members who still owe their vibes get that sheet this visit instead
    if ((me.interests || []).filter((i) => VIBES.some((v) => v.key === i)).length < MIN_VIBES) return
    const id = setTimeout(() => setWhatsNewOpen(true), 1200)
    return () => clearTimeout(id)
  }, [state, me, nameOpen, vibesOpen, paywall, personNo, profileOpen, worldOpen, focusSpot, dmWith, cityRoom, spotRoom])
  const closeWhatsNew = () => { markSeen(WHATS_NEW); setWhatsNewOpen(false) }

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
      fetch(`/api/unread?t=${token}`)
        .then((r) => r.json())
        .then((d) => typeof d.dms === "number" && setUnreadTotal(d.dms))
        .catch(() => {})
    check()
    const id = setInterval(check, 15000)
    // back to the app (or the tab): check right away instead of waiting
    const onShow = () => document.visibilityState === "visible" && check()
    document.addEventListener("visibilitychange", onShow)
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onShow) }
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
      // only a real "no such member" is denied; a network blip gets a retry, not a logout
      .catch((e) => setState((st) => (st === "ok" ? st : e === 401 ? "denied" : "offline")))
  }, [token])

  useEffect(() => { if (state === "ok") registerSW(token) }, [state, token])

  // warm every tab in the background once you're in, so switching tabs opens
  // on real data instantly instead of a spinner
  const meCity = me?.city
  useEffect(() => {
    if (state !== "ok" || !meCity) return
    const id = setTimeout(() => {
      prefetch(`/api/trips?t=${token}`)
      prefetch(`/api/members?t=${token}&city=${meCity}`)
      prefetch(`/api/dm?t=${token}`)
      prefetch(`/api/mood?t=${token}&city=medellin`)
      prefetch(`/api/rides?t=${token}&city=medellin`)
    }, 600)
    return () => clearTimeout(id)
  }, [state, token, meCity])

  // a tapped push lands here: ?go=dm-021 opens that chat, ?go=spot-12 opens the spot
  useEffect(() => {
    if (state !== "ok") return
    const p = new URLSearchParams(window.location.search)
    let go = p.get("go") || ""
    if (!go) { try { go = localStorage.getItem("irl:go") || ""; localStorage.removeItem("irl:go") } catch { /* private mode */ } }
    const dm = go.match(/^dm-(\d{3})$/)
    const spot = go.match(/^spot-(\d+)$/)
    const now = go.match(/^now-([a-z]+)$/)
    if (now) { setTab("trips"); setTimeout(() => window.dispatchEvent(new CustomEvent("irl:now", { detail: now[1] })), 700) }
    if (dm) { setDmWith({ memberNo: dm[1] }); setTab("dms") }
    else if (spot) { setFocusSpot(Number(spot[1])); setTab("mood") }
    if (p.get("go")) window.history.replaceState({}, "", `/?screen=app&t=${token}`)
  }, [state, token])

  // what to do after someone unlocks: deliver the message they wrote, or buy the ride
  const [notice, setNotice] = useState("")
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 4200); return () => clearTimeout(id) }, [notice])
  const buyRide = useCallback(async (rideId) => {
    const r = await fetch("/api/rides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, rideId }),
    }).then((x) => x.json()).catch(() => null)
    if (r?.url) window.location.href = r.url
    else if (r?.gate === "member") setPaywall({ reason: "member", next: `ride-${rideId}` })
    else setNotice(r?.error || t("the ride checkout isn't available right now"))
  }, [token])
  const runNext = useCallback(async (next) => {
    const deliver = String(next || "").match(/^deliver-(\d{3})$/)
    const ride = String(next || "").match(/^ride-(\d+)$/)
    if (deliver) {
      let pending = null
      try { pending = JSON.parse(localStorage.getItem("irl:pending-dm") || "null") } catch { /* private mode */ }
      if (pending?.to === deliver[1] && pending.text) {
        const r = await fetch("/api/dm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ t: token, to: pending.to, text: pending.text, replyTo: pending.replyTo ?? null }),
        }).then((x) => x.json()).catch(() => null)
        if (r?.ok) {
          try { localStorage.removeItem("irl:pending-dm") } catch { /* private mode */ }
          setNotice(t("delivered. your free month has started"))
        }
      }
      setDmWith({ memberNo: deliver[1], name: pending?.name || "", photo: pending?.photo || null })
      setTab("dms")
    } else if (/^room-spot-\d+-\d{8}$/.test(next || "")) {
      const channel = next.slice(5)
      let pending = null
      try { pending = JSON.parse(localStorage.getItem("irl:pending-room") || "null") } catch { /* private mode */ }
      if (pending?.channel === channel && pending.text) {
        const r = await fetch("/api/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ t: token, channel, action: "send", text: pending.text }),
        }).then((x) => x.json()).catch(() => null)
        if (r?.ok) { try { localStorage.removeItem("irl:pending-room") } catch { /* private mode */ } setNotice(t("delivered. your free month has started")) }
      }
      setSpotRoom({ channel, title: pending?.title || t("the plan") })
      setTab("mood")
    } else if (/^invite-\d+-\d{8}-\d{3}$/.test(next || "")) {
      const [, spotId, n, to] = next.split("-")
      const r = await fetch("/api/mood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, action: "invite", spotId: Number(spotId), night: `${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6)}`, to }),
      }).then((x) => x.json()).catch(() => null)
      setNotice(r?.ok ? t("sent. your free month has started") : t("you're in. your free month has started"))
      setFocusSpot(Number(spotId))
      setTab("mood")
    } else if (ride) {
      buyRide(Number(ride[1]))
    } else {
      setNotice(t("you're in. your free month has started"))
    }
  }, [token, buyRide])

  // back from stripe: the free month (activate, then do "next"), or a ride seat
  useEffect(() => {
    if (state !== "ok") return
    const p = new URLSearchParams(window.location.search)
    const session = p.get("session_id")
    if (!session) return
    const clean = () => window.history.replaceState({}, "", `/?screen=app&t=${token}`)
    if (p.get("sub") === "1") {
      fetch(`/api/activate?t=${token}&session_id=${encodeURIComponent(session)}`)
        .then((r) => (r.ok ? runNext(p.get("next")) : setNotice(t("we couldn't confirm that payment yet. refresh in a minute"))))
        .catch(() => {})
        .finally(clean)
    } else if (p.get("ride")) {
      fetch("/api/rides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, action: "confirm", session_id: session }),
      })
        .then((r) => r.json())
        .then((d) => setNotice(d?.ok ? t("your seat is booked. see you at 3am") : t("we couldn't confirm that payment yet. refresh in a minute")))
        .catch(() => {})
        .finally(clean)
    }
  }, [state, token, runNext])

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
  if (state === "offline") {
    return (
      <div className="flex min-h-[var(--app-h)] flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="display text-[24px] font-bold">{t("can't reach irlpass")}</p>
        <p className="text-[14px] text-ink-soft">{t("the signal dropped. your account is fine.")}</p>
        <button onClick={() => window.location.reload()} className="mt-2 rounded-full bg-ink px-6 py-3 text-[14px] font-bold text-cream">{t("try again")}</button>
      </div>
    )
  }

  // josh's order: dates and chat together, tonight's mood next to people
  // josh's funnel order: the two discovery tabs lead, chat is the pipe, mood is lightest
  const TABS = [
    { key: "trips", label: t("dates"), icon: CalendarPlus },
    { key: "members", label: t("people"), icon: UsersThree },
    { key: "dms", label: t("chat"), icon: ChatsCircle },
    { key: "mood", label: t("mood"), icon: Sparkle },
  ]
  const inThread = (tab === "chats" && activeChat) || (tab === "dms" && dmWith) || (tab === "mood" && spotRoom) || cityRoom

  return (
    <SpotLink.Provider value={(id) => { setCityRoom(null); setSpotRoom(null); setDmWith(null); setActiveChat(null); setFocusSpot(id); setTab("mood") }}>
    <MotionConfig reducedMotion="user">
    <div className="relative flex h-[var(--app-h)] flex-col">
      <ModeStrip token={token} me={me} />
      {!inThread && <TopBar me={me} dot={profileNew} onProfile={() => { setCloseSheets((x) => x + 1); setProfileOpen(true) }} />}
      <motion.div
        key={`${tab}-${cityRoom?.slug || ""}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {!cityRoom && tab === "trips" && <Trips token={token} me={me} unlockRequest={unlockRequest} closeSheets={closeSheets} postCity={postCity} onCityPosted={(c) => { setViewCity(c); fetch(`/api/me?t=${token}`).then((r) => r.json()).then((m) => m?.memberNo && setMe(m)).catch(() => {}) }} onOpenDM={(m) => { setDmWith(m); setDmReturn("trips"); setTab("dms") }} onOpenPerson={setPersonNo} onPaywall={setPaywall} onJoinTrip={(p, nights, city) => makePlan(p, nights, city)} onPostCityUsed={() => setPostCity(null)} />}
        {!cityRoom && tab === "members" && (
          <Around
            key={peopleKey}
            token={token}
            me={me}
            viewCity={viewCity}
            onViewCity={setViewCity}
            onOpenDM={(m) => { setDmWith(m); setDmReturn("members"); setTab("dms") }}
            onMakePlan={(p) => makePlan(p, null, viewCity || me.city)}
            onOpenPerson={setPersonNo}
            onOpenWorld={() => setWorldOpen(true)}
            onOpenTonight={() => setTab("mood")}
            onUnlock={() => setPaywall("dm")}
            onNeedDates={(c) => { setTab("trips"); setPostCity(c) }}
          />
        )}
        {cityRoom && (
          <Thread
            token={token}
            me={me}
            channel={cityRoom.slug}
            title={`${cityRoom.emoji}  ${cityRoom.name} ${t("chat")}`}
            onBuyRide={buyRide}
            photoMap={photoMap}
            onOpenPerson={setPersonNo}
            onNeedDates={(c) => { setCityRoom(null); setTab("trips"); setPostCity(c) }}
            onBack={() => setCityRoom(null)}
            onSeen={(lastId) => { try { if (lastId) localStorage.setItem(`irlpass_seen_${cityRoom.slug}`, String(lastId)) } catch { /* private mode */ } }}
          />
        )}
        {!cityRoom && tab === "mood" && !spotRoom && <Mood token={token} me={me} onOpenRoom={setSpotRoom} focusSpot={focusSpot} onFocused={() => setFocusSpot(null)} onBuyRide={buyRide} planWith={planWith} onPlanDone={() => setPlanWith(null)} onPaywall={setPaywall} />}
        {!cityRoom && tab === "mood" && spotRoom && (
          <Thread
            token={token}
            me={me}
            channel={spotRoom.channel}
            title={spotRoom.title}
            onPaywall={setPaywall}
            photoMap={photoMap}
            onOpenPerson={setPersonNo}
            onBack={() => setSpotRoom(null)}
          />
        )}
        {!cityRoom && tab === "dms" && <DMScreen token={token} me={me} openWith={dmWith} setOpenWith={(v) => {
          setDmWith(v)
          // back out of a thread opened from "say hi": return to that screen
          if (v === null && dmReturn) { setTab(dmReturn); setDmReturn(null) }
        }} photoMap={photoMap} onOpenPerson={setPersonNo} onOpenWorld={() => setWorldOpen(true)} onNeedDates={(city) => { setTab("trips"); setPostCity(city) }} onPaywall={(r) => setPaywall(r === "unlock" ? "dm" : r)} onBuyRide={buyRide} onOpenRoom={setCityRoom} />}
      </motion.div>
      <AnimatePresence>
        {profileOpen && (
          <ProfileSheet
            token={token}
            me={me}
            onPhoto={(photo) => { setMe((m) => ({ ...m, photo })); setProfileOpen(false) }}
            onSafety={(patch) => setMe((m) => ({ ...m, ...patch }))}
            onVibes={() => { setProfileOpen(false); setVibesOpen(true) }}
            profileNew={profileNew}
            onOpenProfile={() => { clearProfileNew(); setProfileOpen(false); setPersonNo(me.memberNo) }}
            onHost={() => { setProfileOpen(false); setHostOpen(true) }}
            onClose={() => setProfileOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {hostOpen && <HostSheet token={token} onClose={() => setHostOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {worldOpen && (
          <World
            token={token}
            onClose={() => setWorldOpen(false)}
            onBrowse={(slug) => { setWorldOpen(false); setViewCity(slug); setTab("members") }}
            onOpenRoom={(c) => { setWorldOpen(false); setCityRoom(c) }}
            onPaywall={(c) => { setWorldOpen(false); setPaywall(c?.slug ? { reason: "city", city: c.slug } : "city") }}
            onOpenPerson={(no) => { setWorldOpen(false); setPersonNo(no) }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {personNo && (
          <PersonSheet
            token={token}
            memberNo={personNo}
            onClose={() => setPersonNo(null)}
            onMessage={(p) => {
              if (!p.talked) return makePlan(p, null, p.trips?.[0]?.city || me.city)
              setPersonNo(null); setDmWith({ memberNo: p.memberNo, name: p.name || p.first, ig: p.ig, photo: p.photo }); setDmReturn(tab); setTab("dms")
            }}
            onUnlock={() => { setPersonNo(null); setPaywall("dm") }}
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
        {whatsNewOpen && (
          <WhatsNew
            onClose={closeWhatsNew}
            onGo={(key) => {
              closeWhatsNew()
              if (key === "profile") { clearProfileNew(); setPersonNo(me.memberNo) }
              else if (key === "world") setWorldOpen(true)
              else if (key === "mood") { clearMoodNew(); setTab("mood") }
              else if (key === "dms") setTab("dms")
              else if (key === "now") setTab("trips")
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {paywall && (
          <PaywallSheet
            token={token}
            me={me}
            city={me.city}
            {...(typeof paywall === "string" ? { reason: paywall } : paywall)}
            onUnlocked={(next) => { setPaywall(null); runNext(next) }}
            onClose={() => setPaywall(null)}
          />
        )}
      </AnimatePresence>
      <PushPrompt token={token} />
      <InstallSheet />
      {(
        <NightPrompt
          token={token}
          city={me.city}
          hold={inThread || pushUp || hostOpen || whatsNewOpen || nameOpen || vibesOpen || !!paywall || profileOpen || !!personNo || worldOpen}
          onAnswered={(a) => { if (a === "out") { setNotice(t("you're on tonight's board")); setPeopleKey((k) => k + 1) } }}
        />
      )}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2.5 text-center text-[13px] font-bold text-cream shadow-lg"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
      {!inThread && (
        <nav className="sticky bottom-0 z-10 flex border-t border-line/70 bg-cream/95 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
          {TABS.map((tb) => (
            <button key={tb.key} onClick={() => { if (tb.key === "mood") clearMoodNew(); setTab(tb.key); setSpotRoom(null); setCityRoom(null); setDmReturn(null); if (tb.key !== "chats") setActiveChat(null); if (tb.key !== "dms") setDmWith(null) }} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="relative flex h-9 w-14 items-center justify-center rounded-full">
                {tab === tb.key && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-full bg-ink/[0.07]"
                  />
                )}
                <tb.icon size={22} weight={tab === tb.key ? "fill" : "regular"} className={`relative ${tab === tb.key ? "text-ink" : "text-ink-soft/60"}`} />
                {tb.key === "mood" && moodNew && tab !== "mood" && <NewDot className="right-2.5 top-1" />}
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
    </SpotLink.Provider>
  )
}
