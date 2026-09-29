import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, InstagramLogo, CircleNotch } from "@phosphor-icons/react"
import { signInWithGoogle } from "../lib/auth"
import { t } from "../lib/i18n"

// the whole pitch in one glance: never travel alone, drop your instagram, go.
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
    <div className="relative flex min-h-[var(--app-h)] flex-col overflow-hidden lg:justify-center">
      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:absolute lg:inset-x-0 lg:top-0 lg:px-10 lg:pt-8">
        <span className="display text-[22px] font-bold lowercase tracking-tight lg:text-[26px]">
          irl<span className="ml-[3px] inline-block -rotate-3 rounded-[0.45em] bg-lime px-[0.3em] pb-[0.06em] leading-none">pass</span>
        </span>
        {memberToken ? (
          <a href={`/?screen=app&t=${memberToken}`} className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-cream">
            {t("open")}
          </a>
        ) : (
          <button
            onClick={() => setLoginOpen(true)}
            className="rounded-full border-2 border-line bg-white/70 px-4 py-2 text-[12px] font-bold"
          >
            {t("log in")}
          </button>
        )}
      </header>

      {/* phone: stacked. desktop: text left, art right, all on one horizon. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:grid lg:min-h-0 lg:flex-none lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-10 lg:px-10">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col lg:flex-none lg:order-1">
          {invitedBy && (
            <div className="mx-5 mb-3 flex w-fit items-center gap-2 rounded-full border-2 border-ink bg-lime px-3.5 py-1.5 lg:mx-0">
              <img src="/art/icon-people.png" alt="" className="h-5 w-5 object-contain" draggable="false" />
              <span className="text-[12.5px] font-bold">@{invitedBy} {t("invited you")}</span>
            </div>
          )}

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 18 }}
            className="display mt-5 whitespace-nowrap px-5 font-bold leading-[0.95] tracking-[-0.035em] lg:mt-0 lg:px-0"
            style={{ fontSize: "clamp(28px, 7.4vw, 46px)" }}
          >
            {invite ? t("come meet them") : t("never travel")}{" "}
            <span className="relative inline-block">
              {invite ? invite.cityName.toLowerCase() : t("alone")}
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -bottom-0.5 left-0 h-[0.14em] w-full origin-left rounded-full bg-lime"
                aria-hidden
              />
            </span>
          </motion.h1>

          <p className="mt-3 px-5 text-[16px] text-ink-soft lg:px-0 lg:text-[19px]">
            {invite
              ? `@${invitedBy} ${t("is there")} ${fmtD(invite.starts)} – ${fmtD(invite.ends)}. ${t("drop your instagram and we'll put you on the same days.")}`
              : t("drop your instagram, post your dates, see who's there.")}
          </p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 140, damping: 20 }}
            className="mt-auto flex flex-col gap-2 px-5 pb-[max(1.1rem,env(safe-area-inset-bottom))] lg:mt-7 lg:max-w-[440px] lg:px-0 lg:pb-0"
          >
            <div className="flex items-center gap-2 rounded-[1.6rem] border-2 border-ink bg-white/85 px-4 py-3 shadow-[0_18px_40px_-24px_rgba(58,50,44,0.7)]">
              <InstagramLogo size={22} weight="duotone" className="shrink-0" />
              <span className="text-[17px] font-semibold text-ink-soft">@</span>
              <input
                id="welcome-ig"
                value={ig}
                onChange={(e) => setIg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start()}
                autoCapitalize="none" autoCorrect="off" spellCheck="false"
                placeholder={t("your instagram")}
                className="w-full bg-transparent text-[17px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50"
              />
            </div>

            {welcomeBack ? (
              <div className="rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3">
                <p className="text-[15px] font-bold">{t("welcome back")} @{handle}</p>
                <p className="mt-0.5 text-[13px]">
                  {t("you're already a member. we emailed a link that opens your account to")} {welcomeBack}.
                </p>
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={handle.length < 3 || checking}
                onClick={start}
                className="flex items-center justify-center gap-2 rounded-full bg-ink py-4 text-[17px] font-bold text-cream disabled:opacity-40"
              >
                {invite ? t("join them") : t("see who's around")} <ArrowRight size={18} weight="bold" />
              </motion.button>
            )}

            {!memberToken && (
              <button
                onClick={() => setLoginOpen(true)}
                className="rounded-full border-2 border-ink bg-white/70 py-3 text-center text-[14px] font-bold"
              >
                {t("already a member? log in")}
              </button>
            )}

            <div className="flex flex-col items-center gap-1 pt-2 lg:items-start">
              <p className="flex items-center gap-2 text-[13.5px] font-bold">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-deep" />
                {stats?.members ?? 200} {t("travelers")}
                {stats?.travelling > 0 && (
                  <span className="font-semibold text-ink-soft">
                    · {stats.travelling} {t("with dates up")}
                  </span>
                )}
              </p>
              <p className="text-[12.5px] text-ink-soft">
                {t("post your dates")} <span className="text-ink-soft/40">·</span> {t("see who overlaps")}{" "}
                <span className="text-ink-soft/40">·</span> {t("say hi")}
              </p>
            </div>
          </motion.div>
        </div>

        <div className="relative flex min-h-[180px] w-full min-w-0 flex-1 items-center justify-center px-4 lg:order-2 lg:min-h-0 lg:flex-none lg:px-0">
          <motion.img
            src="/art/hero.png"
            alt=""
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 110, damping: 18, delay: 0.1 }}
            className="h-full max-h-[42vh] w-auto max-w-full select-none object-contain lg:max-h-none lg:w-full"
            draggable="false"
          />
        </div>
      </div>

      {loginOpen && (
        <>
          <div
            onClick={() => setLoginOpen(false)}
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[460px] rounded-t-[1.75rem] border-t-2 border-line bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
            <h2 className="display text-[22px] font-bold">{t("welcome back")}</h2>
            <p className="mt-1 text-[13.5px] text-ink-soft">
              {t("we'll email you a code and a link. no password.")}
            </p>

            {sent ? (
              <div className="mt-4">
                <div className="rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3.5">
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
                  className="mt-3 w-full rounded-[1.4rem] border-2 border-line bg-white px-4 py-3.5 text-center text-[26px] font-bold tracking-[0.4em] outline-none focus:border-ink placeholder:text-ink-soft/30"
                />
                {codeBusy && <p className="mt-2 text-center text-[13px] text-ink-soft">{t("checking…")}</p>}
                {codeErr && <p className="mt-2 text-center text-[13px] font-semibold text-[#8f2b2b]">{codeErr}</p>}
                <button
                  onClick={sendLink}
                  disabled={wait > 0 || sending}
                  className="mt-3 w-full rounded-full border-2 border-line bg-white/70 py-3 text-[14px] font-bold disabled:opacity-50"
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
                  className="mt-4 w-full rounded-[1.4rem] border-2 border-line bg-white/80 px-4 py-3.5 text-[16px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
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
                  className="mt-2 w-full rounded-full border-2 border-line bg-white/70 py-3.5 text-[15px] font-bold"
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
