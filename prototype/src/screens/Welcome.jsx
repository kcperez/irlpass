import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, InstagramLogo, CircleNotch } from "@phosphor-icons/react"
import { signInWithGoogle } from "../lib/auth"
import { Logo } from "../components/bits"
import { t } from "../lib/i18n"

// the front door, in the app's own look (dark, cobalt, real screens). the pitch
// in one glance: land anywhere, the city is already in your pocket, and the
// people going are one tap away. drop your instagram, go.
const FACES = [0, 1, 6, 3, 8]
const fmtD = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

export default function Welcome({ onStart, invitedBy, invite }) {
  const [ig, setIg] = useState("")
  const [stats, setStats] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  const [sendErr, setSendErr] = useState("")
  const [wait, setWait] = useState(0) // seconds until resend is allowed
  const [code, setCode] = useState("")
  const [codeErr, setCodeErr] = useState("")
  const [codeBusy, setCodeBusy] = useState(false)
  useEffect(() => {
    if (!wait) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  // says "check your email" only when the email actually went out
  const sendLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setSendErr(t("that doesn't look like an email"))
    setSending(true)
    setSendErr("")
    const r = await fetch("/api/email-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, d: {} }))
    setSending(false)
    if (!r.ok) return setSendErr(r.d?.error || t("we couldn't send the email. try again in a minute."))
    setSent(true)
    setWait(30)
  }

  // the 6-digit code from the email signs you in right here
  const useCode = async (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 6)
    setCode(digits)
    setCodeErr("")
    if (digits.length !== 6) return
    setCodeBusy(true)
    const r = await fetch("/api/login-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), code: digits }),
    }).then((x) => x.json()).catch(() => null)
    setCodeBusy(false)
    if (r?.token) {
      try { localStorage.setItem("irlpass_member_token", r.token) } catch { /* private mode */ }
      window.location.href = `/?screen=app&t=${r.token}`
    } else {
      setCodeErr(r?.error || t("that code doesn't match"))
    }
  }

  // real numbers, straight from the database
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {})
  }, [])
  const memberToken = typeof localStorage !== "undefined" && localStorage.getItem("irlpass_member_token")
  const handle = ig.replace(/^@+/, "").trim()
  const [checking, setChecking] = useState(false)
  const [welcomeBack, setWelcomeBack] = useState(null) // masked email we sent a login link to

  // an instagram that's already a member gets a login link, not signup again
  const start = async () => {
    if (handle.length < 3 || checking) return
    setChecking(true)
    const r = await fetch("/api/handle-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ig: handle }),
    }).then((x) => x.json()).catch(() => null)
    setChecking(false)
    if (r?.member) return setWelcomeBack(r.hint || "your email")
    onStart(handle)
  }

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(45% 35% at 15% 5%, rgba(74,102,255,.28), transparent 70%), radial-gradient(40% 35% at 90% 30%, rgba(143,160,255,.12), transparent 70%), #15110f" }} />
      <header className="relative z-10 mx-auto flex max-w-[1160px] items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:px-10 lg:pt-7">
        <Logo h="h-10" />
        <span className="flex items-center gap-2">
        <a href="https://getty.irlpass.xyz" className="hidden rounded-full px-3 py-2 text-[13px] font-bold text-ink-soft hover:text-ink sm:inline-block">{t("for venues")}</a>
        {memberToken ? (
          <a href={`/?screen=app&t=${memberToken}`} className="rounded-full bg-lime px-4 py-2 text-[13px] font-bold">{t("open")}</a>
        ) : (
          <button onClick={() => setLoginOpen(true)} className="rounded-full border border-line px-4 py-2 text-[13px] font-bold">{t("log in")}</button>
        )}
        </span>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1160px] items-center gap-10 px-5 pb-14 pt-8 lg:grid-cols-[1.05fr_1fr] lg:px-10 lg:pt-14">
        <div>
          {invitedBy ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft"><span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_10px_#4a66ff]" />@{invitedBy} {t("invited you")}</span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft"><span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_10px_#4a66ff]" />{t("for people who travel")}</span>
          )}
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 18 }}
            className="serif-display mt-4 leading-[0.98]" style={{ fontSize: "clamp(42px, 9vw, 76px)" }}>
            {invite ? t("come meet them in") : t("never travel")}{" "}
            <span className="inline-block -rotate-2 rounded-[0.22em] bg-lime px-[0.14em] pb-[0.04em] text-white">{invite ? invite.cityName.toLowerCase() : t("alone")}</span>
          </motion.h1>
          <p className="mt-4 max-w-[520px] text-[17px] leading-snug text-ink-soft lg:text-[19px]">
            {invite
              ? `@${invitedBy} ${t("is there")} ${fmtD(invite.starts)} – ${fmtD(invite.ends)}. ${t("drop your instagram and we'll put you on the same days.")}`
              : t("land anywhere and the city's already in your pocket: what's on tonight, where locals eat, and the people going with you.")}
          </p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, type: "spring", stiffness: 140, damping: 20 }} className="mt-7 flex max-w-[460px] flex-col gap-2">
            <div className="flex items-center gap-2 rounded-full border border-line bg-white px-4 py-3">
              <InstagramLogo size={22} weight="duotone" className="shrink-0" />
              <span className="text-[17px] font-semibold text-ink-soft">@</span>
              <input id="welcome-ig" value={ig} onChange={(e) => setIg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()}
                autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder={t("your instagram")}
                className="w-full bg-transparent text-[17px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/60" />
            </div>
            {welcomeBack ? (
              <div className="rounded-[1.4rem] border border-line bg-white px-4 py-3">
                <p className="text-[15px] font-bold">{t("welcome back")} @{handle}</p>
                <p className="mt-0.5 text-[13px]">{t("you're already a member. we emailed a link that opens your account to")} {welcomeBack}.</p>
              </div>
            ) : (
              <motion.button whileTap={{ scale: 0.97 }} disabled={handle.length < 3 || checking} onClick={start}
                className="flex items-center justify-center gap-2 rounded-full bg-lime py-4 text-[17px] font-bold shadow-[0_14px_40px_-12px_rgba(74,102,255,.7)] disabled:opacity-40">
                {checking ? <CircleNotch size={18} className="animate-spin" /> : null}{invite ? t("join them") : t("get in")} <ArrowRight size={18} weight="bold" />
              </motion.button>
            )}
            <div className="mt-2 flex items-center gap-3">
              <span className="flex -space-x-2">{FACES.map((f) => <img key={f} src={`/getty/pfp/${f}.jpg`} alt="" className="h-8 w-8 rounded-full border-2 border-cream object-cover" />)}</span>
              <p className="text-[13.5px] font-semibold text-ink-soft"><span className="font-bold text-ink">{stats?.members ?? 480}</span> {t("travelers in 5 cities")}</p>
            </div>
            {!memberToken && (
              <button onClick={() => setLoginOpen(true)} className="mt-1 w-fit text-[13px] font-semibold text-ink-soft underline underline-offset-4">{t("already a member? log in")}</button>
            )}
          </motion.div>
        </div>

        {/* the app itself: real screens, floating */}
        <div className="relative mx-auto h-[560px] w-full max-w-[470px] lg:h-[640px]">
          <motion.img src="/landing/city.jpg" alt="" initial={{ opacity: 0, y: 30, rotate: -8 }} animate={{ opacity: 1, y: 0, rotate: -6 }} transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.1 }}
            className="absolute left-0 top-6 w-[52%] rounded-[2rem] border border-white/15 shadow-[0_40px_90px_-30px_rgba(0,0,0,.9)]" />
          <motion.img src="/landing/buatta.jpg" alt="" initial={{ opacity: 0, y: 40, rotate: 9 }} animate={{ opacity: 1, y: 0, rotate: 5 }} transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.22 }}
            className="absolute right-0 top-0 w-[52%] rounded-[2rem] border border-white/15 shadow-[0_40px_90px_-30px_rgba(0,0,0,.9)]" />
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 18 }}
            className="absolute bottom-10 left-[18%] flex items-center gap-2.5 rounded-[1.2rem] border border-white/15 bg-black/55 px-3.5 py-2.5 backdrop-blur-xl">
            <span className="flex -space-x-2">{[0, 6, 3].map((f) => <img key={f} src={`/getty/pfp/${f}.jpg`} alt="" className="h-7 w-7 rounded-full border-2 border-black object-cover" />)}</span>
            <span className="text-[13px] font-bold text-white">{t("4 going tonight")} · <span className="text-[#8fa0ff]">{t("chat open")}</span></span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
            className="absolute bottom-28 right-[4%] max-w-[210px] rounded-[1.2rem] rounded-br-md bg-lime px-3.5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_18px_40px_-14px_rgba(74,102,255,.8)]">
            {t("anyone down for dinner at buatta? 9pm")}
          </motion.div>
        </div>
      </main>

      <section className="relative z-10 mx-auto grid max-w-[1160px] gap-3 px-5 pb-20 sm:grid-cols-3 lg:px-10">
        {[["🧭", t("ask your city anything"), t("dinner tonight, the airport, techno. michelin picks, real answers, what's on.")], ["🎟️", t("everything on this week"), t("swipe through what's happening. tap i'm going and you're in the group chat.")], ["💬", t("meet the people going"), t("every event has its own chat, so you walk in already knowing someone.")]].map(([e, h, b]) => (
          <div key={h} className="rounded-[1.5rem] border border-line bg-white p-5">
            <p className="text-[22px]">{e}</p>
            <p className="serif-display mt-2 text-[22px] leading-tight">{h}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">{b}</p>
          </div>
        ))}
      </section>

      <footer className="relative z-10 mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-6 text-[13px] text-ink-soft lg:px-10">
        <span>irlpass · {t("meet people where you are")}</span>
        <a href="https://getty.irlpass.xyz" className="font-bold text-ink">{t("own a bar, café or studio?")} <span className="text-lime-deep">getty ↗</span></a>
      </footer>

      {loginOpen && (
        <>
          <div
            onClick={() => setLoginOpen(false)}
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[460px] rounded-t-[1.75rem] border-t border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
            <h2 className="display text-[22px] font-bold">{t("welcome back")}</h2>
            <p className="mt-1 text-[13.5px] text-ink-soft">
              {t("we'll email you a code and a link. no password.")}
            </p>

            {sent ? (
              <div className="mt-4">
                <div className="rounded-[1.4rem] bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-4 py-3.5">
                  <p className="text-[14px] font-bold">{t("check your email")}</p>
                  <p className="mt-0.5 text-[12.5px]">{t("type the 6-digit code here, or tap the link in the email. check spam if it's not there.")}</p>
                </div>
                <input
                  id="login-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => useCode(e.target.value)}
                  placeholder="000000"
                  className="mt-3 w-full rounded-[1.4rem] border border-line bg-white px-4 py-3.5 text-center text-[26px] font-bold tracking-[0.4em] outline-none focus:border-ink placeholder:text-ink-soft/30"
                />
                {codeBusy && <p className="mt-2 text-center text-[13px] text-ink-soft">{t("checking…")}</p>}
                {codeErr && <p className="mt-2 text-center text-[13px] font-semibold text-[#8f2b2b]">{codeErr}</p>}
                <button
                  onClick={sendLink}
                  disabled={wait > 0 || sending}
                  className="mt-3 w-full rounded-full border border-line bg-white/70 py-3 text-[14px] font-bold disabled:opacity-50"
                >
                  {wait > 0 ? `${t("resend in")} ${wait}s` : t("resend the email")}
                </button>
              </div>
            ) : (
              <>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendLink()}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder={t("the email you signed up with")}
                  className="mt-4 w-full rounded-[1.4rem] border border-line bg-white/80 px-4 py-3.5 text-[16px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
                />
                {sendErr && <p className="mt-2 text-[13px] font-semibold text-[#8f2b2b]">{sendErr}</p>}
                <button
                  onClick={sendLink}
                  disabled={sending}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream disabled:opacity-50"
                >
                  {sending ? <CircleNotch size={16} className="animate-spin" /> : null}
                  {t("email me a code")}
                </button>
                <button
                  onClick={() => signInWithGoogle()}
                  className="mt-2 w-full rounded-full border border-line bg-white/70 py-3.5 text-[15px] font-bold"
                >
                  {t("continue with google")}
                </button>
              </>
            )}

            <button onClick={() => setLoginOpen(false)} className="mt-2 w-full py-2 text-center text-[13px] text-ink-soft underline">
              {t("close")}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
